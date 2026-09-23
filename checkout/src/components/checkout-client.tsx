'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPublicCharge, type PublicChargeLoadResult } from '@/lib/public-api';
import type {
  PaymentMethod,
  PublicActivePayment,
  PublicCharge,
  PublicPaymentStartResponse,
} from '@/lib/types';
import { CheckoutFlow } from './checkout-flow';
import { CheckoutLoading } from './checkout-loading';
import { CheckoutPaid } from './checkout-paid';
import { CheckoutShell } from './checkout-shell';
import { CheckoutUnavailable } from './checkout-unavailable';
import { OrderSummary } from './order-summary';
import { PendingPayment } from './pending-payment';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'success'; charge: PublicCharge }
  | Exclude<PublicChargeLoadResult, { kind: 'success' }>;

type CheckoutView = 'MENU' | 'PIX' | 'CARD';

const PENDING_REFRESH_MS = 12_000;
const AUTOMATIC_REFRESH_DEDUP_MS = 750;
const VIEW_STORAGE_PREFIX = 'canfy.checkout.view:';

function storedView(publicToken: string): CheckoutView {
  try {
    const value = window.sessionStorage.getItem(VIEW_STORAGE_PREFIX + publicToken);
    if (value === 'MENU' || value === 'PIX' || value === 'CARD') return value;
  } catch {}
  return 'MENU';
}

function persistView(publicToken: string, view: CheckoutView): void {
  try {
    window.sessionStorage.setItem(VIEW_STORAGE_PREFIX + publicToken, view);
  } catch {}
}

function clearPersistedView(publicToken: string): void {
  try {
    window.sessionStorage.removeItem(VIEW_STORAGE_PREFIX + publicToken);
  } catch {}
}

function publicPayments(charge: PublicCharge): PublicActivePayment[] {
  if (charge.availablePayments) return charge.availablePayments;
  return charge.activePayment ? [charge.activePayment] : [];
}

function paymentForView(
  charge: PublicCharge,
  view: CheckoutView,
): PublicActivePayment | undefined {
  if (view === 'MENU') return undefined;
  const method: PaymentMethod = view;
  return publicPayments(charge).find((payment) => payment.method === method);
}

export function CheckoutClient({ publicToken }: { publicToken: string }) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [view, setViewState] = useState<CheckoutView>('MENU');
  const [refreshIssue, setRefreshIssue] = useState(false);
  const mounted = useRef(true);
  const automaticController = useRef<AbortController | null>(null);
  const automaticInFlight = useRef(false);
  const lastAutomaticRefreshAt = useRef(0);

  const setView = useCallback(
    (next: CheckoutView) => {
      setViewState(next);
      persistView(publicToken, next);
    },
    [publicToken],
  );

  const refresh = useCallback(
    async (options?: { silent?: boolean; signal?: AbortSignal }) => {
      const result = await loadPublicCharge(publicToken, options?.signal);
      if (!mounted.current) return;

      if (result.kind === 'success') {
        if (result.data.orderStatus === 'PAID') {
          clearPersistedView(publicToken);
        }
        setState({ kind: 'success', charge: result.data });
        setRefreshIssue(false);
        return;
      }

      if (
        options?.silent &&
        (result.kind === 'temporary_error' || result.kind === 'unexpected_response')
      ) {
        setRefreshIssue(true);
        return;
      }

      setState(result);
    },
    [publicToken],
  );

  const refreshSilently = useCallback(async () => {
    const now = Date.now();
    if (
      automaticInFlight.current ||
      now - lastAutomaticRefreshAt.current < AUTOMATIC_REFRESH_DEDUP_MS
    ) {
      return;
    }

    lastAutomaticRefreshAt.current = now;
    automaticInFlight.current = true;
    automaticController.current?.abort();

    const controller = new AbortController();
    automaticController.current = controller;

    try {
      await refresh({ silent: true, signal: controller.signal });
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === 'AbortError') && mounted.current) {
        setRefreshIssue(true);
      }
    } finally {
      if (automaticController.current === controller) {
        automaticController.current = null;
      }
      automaticInFlight.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    setViewState(storedView(publicToken));

    const controller = new AbortController();
    void refresh({ signal: controller.signal }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError') && mounted.current) {
        setState({ kind: 'temporary_error' });
      }
    });

    return () => {
      mounted.current = false;
      controller.abort();
      automaticController.current?.abort();
    };
  }, [publicToken, refresh]);

  const isPending =
    state.kind === 'success' && state.charge.orderStatus === 'PENDING_PAYMENT';

  useEffect(() => {
    if (!isPending) return;

    const interval = window.setInterval(() => {
      void refreshSilently();
    }, PENDING_REFRESH_MS);

    const onFocus = () => {
      void refreshSilently();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshSilently();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      automaticController.current?.abort();
    };
  }, [isPending, refreshSilently]);

  useEffect(() => {
    if (state.kind !== 'success' || state.charge.orderStatus === 'PAID' || view === 'MENU') {
      return;
    }
    if (!paymentForView(state.charge, view)) {
      setView('MENU');
    }
  }, [setView, state, view]);

  const onStarted = useCallback(
    (started: PublicPaymentStartResponse, method: PaymentMethod) => {
      if (started.orderStatus === 'PAID') {
        clearPersistedView(publicToken);
      } else {
        setView(method);
      }

      setState((current) => {
        if (current.kind !== 'success') return current;

        if (started.orderStatus === 'PAID') {
          return {
            kind: 'success',
            charge: {
              ...current.charge,
              orderStatus: 'PAID',
              availablePayments: [],
              activePayment: undefined,
            },
          };
        }

        const previous = publicPayments(current.charge);
        const activePayment = started.activePayment;
        const availablePayments = activePayment
          ? [
              activePayment,
              ...previous.filter((payment) => payment.method !== activePayment.method),
            ]
          : previous;

        return {
          kind: 'success',
          charge: {
            ...current.charge,
            orderStatus: 'PENDING_PAYMENT',
            availablePayments,
            activePayment: activePayment ?? current.charge.activePayment,
          },
        };
      });
    },
    [publicToken, setView],
  );

  if (state.kind === 'loading') return <CheckoutLoading />;
  if (state.kind === 'not_found') return <CheckoutUnavailable kind="not_found" />;
  if (state.kind === 'gone') return <CheckoutUnavailable kind="gone" />;
  if (state.kind === 'temporary_error') {
    return <CheckoutUnavailable kind="temporary_error" onRetry={() => void refresh()} />;
  }
  if (state.kind === 'unexpected_response') {
    return <CheckoutUnavailable kind="unexpected_response" onRetry={() => void refresh()} />;
  }

  const { charge } = state;
  if (charge.orderStatus === 'PAID') return <CheckoutPaid charge={charge} />;

  const selectedPayment = paymentForView(charge, view);
  if (charge.orderStatus === 'PENDING_PAYMENT' && view !== 'MENU' && selectedPayment) {
    return (
      <PendingPayment
        charge={charge}
        payment={selectedPayment}
        refreshIssue={refreshIssue}
        onChangePaymentMethod={() => setView('MENU')}
      />
    );
  }

  return (
    <CheckoutShell
      main={<CheckoutFlow charge={charge} onStarted={onStarted} />}
      summary={<OrderSummary charge={charge} />}
    />
  );
}

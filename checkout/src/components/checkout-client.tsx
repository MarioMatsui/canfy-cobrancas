'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPublicCharge, type PublicChargeLoadResult } from '@/lib/public-api';
import type { PublicCharge, PublicPaymentStartResponse } from '@/lib/types';
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

const PENDING_REFRESH_MS = 12_000;

export function CheckoutClient({ publicToken }: { publicToken: string }) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshIssue, setRefreshIssue] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(
    async (options?: { silent?: boolean; signal?: AbortSignal }) => {
      if (!options?.silent) setRefreshing(true);
      const result = await loadPublicCharge(publicToken, options?.signal);
      if (!mounted.current) return;

      if (result.kind === 'success') {
        setState({ kind: 'success', charge: result.data });
        setRefreshIssue(false);
      } else if (options?.silent && result.kind === 'temporary_error') {
        setRefreshIssue(true);
      } else {
        setState(result);
      }

      if (!options?.silent) setRefreshing(false);
    },
    [publicToken],
  );

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();

    void refresh({ signal: controller.signal }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError') && mounted.current) {
        setState({ kind: 'temporary_error' });
      }
    });

    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (state.kind !== 'success' || state.charge.orderStatus !== 'PENDING_PAYMENT') {
      return;
    }

    let stopped = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const poll = async () => {
      if (stopped) return;
      try {
        await refresh({ silent: true, signal: controller.signal });
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === 'AbortError') && mounted.current) {
          setRefreshIssue(true);
        }
      }
      if (!stopped) {
        timer = window.setTimeout(() => void poll(), PENDING_REFRESH_MS);
      }
    };

    timer = window.setTimeout(() => void poll(), PENDING_REFRESH_MS);

    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller.abort();
    };
  }, [refresh, state]);

  const onStarted = useCallback((started: PublicPaymentStartResponse) => {
    setState((current) => {
      if (current.kind !== 'success') return current;
      return {
        kind: 'success',
        charge: {
          ...current.charge,
          orderStatus: started.orderStatus,
          activePayment: started.activePayment,
        },
      };
    });
  }, []);

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

  if (charge.orderStatus === 'PENDING_PAYMENT') {
    return (
      <PendingPayment
        charge={charge}
        refreshing={refreshing}
        refreshIssue={refreshIssue}
        onRefresh={() => void refresh()}
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

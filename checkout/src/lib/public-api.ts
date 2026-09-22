import type {
  PaymentMethod,
  PublicActivePayment,
  PublicCharge,
  PublicChargeItem,
  PublicChargeShipment,
  PublicFulfillmentType,
  PublicOrderKind,
  PublicOrderStatus,
  PublicPaymentStartResponse,
  PublicPaymentStatus,
  PublicShipmentType,
} from './types';

export type PublicChargeLoadResult =
  | { kind: 'success'; data: PublicCharge }
  | { kind: 'not_found' }
  | { kind: 'gone' }
  | { kind: 'temporary_error' }
  | { kind: 'unexpected_response' };

export type PublicPaymentStartResult =
  | { kind: 'success'; data: PublicPaymentStartResponse }
  | { kind: 'not_found' }
  | { kind: 'gone' }
  | { kind: 'temporary_error' }
  | { kind: 'unexpected_response' };

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/+$/, '');
const ORDER_STATUSES = new Set<PublicOrderStatus>(['READY', 'PENDING_PAYMENT', 'PAID']);
const ORDER_KINDS = new Set<PublicOrderKind>(['PRODUCT', 'CONSULTATION']);
const FULFILLMENT_TYPES = new Set<PublicFulfillmentType>(['NATIONAL', 'INTERNATIONAL']);
const SHIPMENT_TYPES = new Set<PublicShipmentType>(['NATIONAL', 'INTERNATIONAL']);
const PAYMENT_METHODS = new Set<PaymentMethod>(['PIX', 'CARD']);
const PAYMENT_STATUSES = new Set<PublicPaymentStatus>([
  'PENDING',
  'CONFIRMED',
  'RECEIVED',
  'OVERDUE',
]);
const REQUEST_TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isItem(value: unknown): value is PublicChargeItem {
  if (!isRecord(value)) return false;
  if (typeof value.name !== 'string') return false;
  if (!Number.isInteger(value.quantity) || Number(value.quantity) < 1) return false;
  if (!isFiniteNumber(value.unitPrice) || !isFiniteNumber(value.lineTotal)) return false;
  if (
    value.fulfillmentType !== undefined &&
    (typeof value.fulfillmentType !== 'string' ||
      !FULFILLMENT_TYPES.has(value.fulfillmentType as PublicFulfillmentType))
  ) {
    return false;
  }
  return true;
}

function isShipment(value: unknown): value is PublicChargeShipment {
  if (!isRecord(value)) return false;
  if (typeof value.type !== 'string' || !SHIPMENT_TYPES.has(value.type as PublicShipmentType)) {
    return false;
  }
  if (!isFiniteNumber(value.shippingAmount)) return false;
  if (value.estimatedDaysMin !== undefined && !Number.isInteger(value.estimatedDaysMin)) return false;
  if (value.estimatedDaysMax !== undefined && !Number.isInteger(value.estimatedDaysMax)) return false;
  return true;
}

function isActivePayment(value: unknown): value is PublicActivePayment {
  if (!isRecord(value)) return false;
  if (typeof value.method !== 'string' || !PAYMENT_METHODS.has(value.method as PaymentMethod)) {
    return false;
  }
  if (
    typeof value.status !== 'string' ||
    !PAYMENT_STATUSES.has(value.status as PublicPaymentStatus)
  ) {
    return false;
  }
  if (!isFiniteNumber(value.amount)) return false;
  if (!isOptionalString(value.invoiceUrl)) return false;
  if (!isOptionalString(value.pixQrCode)) return false;
  if (!isOptionalString(value.pixCopyPaste)) return false;
  if (!isOptionalString(value.pixExpirationDate)) return false;
  return true;
}

function isPublicCharge(value: unknown): value is PublicCharge {
  if (!isRecord(value)) return false;
  if (typeof value.publicToken !== 'string') return false;
  if (
    typeof value.orderStatus !== 'string' ||
    !ORDER_STATUSES.has(value.orderStatus as PublicOrderStatus)
  ) {
    return false;
  }
  if (
    value.orderKind !== undefined &&
    (typeof value.orderKind !== 'string' || !ORDER_KINDS.has(value.orderKind as PublicOrderKind))
  ) {
    return false;
  }
  if (typeof value.customerName !== 'string' || !isOptionalString(value.description)) return false;
  if (!Array.isArray(value.items) || !value.items.every(isItem)) return false;
  if (!isFiniteNumber(value.subtotal)) return false;
  if (!isFiniteNumber(value.discountAmount)) return false;
  if (!isFiniteNumber(value.shippingAmount)) return false;
  if (!isFiniteNumber(value.totalAmount)) return false;
  if (!Number.isInteger(value.maxInstallments) || Number(value.maxInstallments) < 1) return false;
  if (!Array.isArray(value.shipments) || !value.shipments.every(isShipment)) return false;
  if (!isOptionalString(value.expiresAt)) return false;
  if (value.activePayment !== undefined && !isActivePayment(value.activePayment)) return false;
  return true;
}

function isStartResponse(value: unknown): value is PublicPaymentStartResponse {
  if (!isRecord(value)) return false;
  if (value.orderStatus !== 'PENDING_PAYMENT' && value.orderStatus !== 'PAID') return false;
  if (value.activePayment !== undefined && !isActivePayment(value.activePayment)) return false;
  if (value.orderStatus === 'PENDING_PAYMENT' && value.activePayment === undefined) return false;
  return true;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

async function classifyResponse<T>(
  response: Response,
  validator: (value: unknown) => value is T,
): Promise<
  | { kind: 'success'; data: T }
  | { kind: 'not_found' }
  | { kind: 'gone' }
  | { kind: 'temporary_error' }
  | { kind: 'unexpected_response' }
> {
  if (response.status === 404) return { kind: 'not_found' };
  if (response.status === 410) return { kind: 'gone' };
  if (response.status === 429 || response.status >= 500) return { kind: 'temporary_error' };
  if (!response.ok) return { kind: 'unexpected_response' };

  const payload: unknown = await response.json();
  if (!validator(payload)) return { kind: 'unexpected_response' };
  return { kind: 'success', data: payload };
}

export async function loadPublicCharge(
  publicToken: string,
  signal?: AbortSignal,
): Promise<PublicChargeLoadResult> {
  try {
    const response = await fetchWithTimeout(
      API_BASE + '/public/payment/' + encodeURIComponent(publicToken),
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      },
      signal,
    );
    return classifyResponse(response, isPublicCharge);
  } catch (error: unknown) {
    if (signal?.aborted) throw error;
    return { kind: 'temporary_error' };
  }
}

export async function startPublicPayment(
  publicToken: string,
  method: PaymentMethod,
  signal?: AbortSignal,
): Promise<PublicPaymentStartResult> {
  try {
    const response = await fetchWithTimeout(
      API_BASE + '/public/payment/' + encodeURIComponent(publicToken) + '/start',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ method }),
        cache: 'no-store',
        credentials: 'same-origin',
      },
      signal,
    );
    return classifyResponse(response, isStartResponse);
  } catch (error: unknown) {
    if (signal?.aborted) throw error;
    return { kind: 'temporary_error' };
  }
}

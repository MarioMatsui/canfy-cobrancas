import type {
  PublicCharge,
  PublicChargeItem,
  PublicChargeShipment,
  PublicFulfillmentType,
  PublicOrderKind,
  PublicOrderStatus,
  PublicShipmentType,
} from './types';

export type PublicChargeLoadResult =
  | { kind: 'success'; data: PublicCharge }
  | { kind: 'not_found' }
  | { kind: 'gone' }
  | { kind: 'temporary_error' }
  | { kind: 'unexpected_response' };

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/+$/, '');
const ORDER_STATUSES = new Set<PublicOrderStatus>(['READY', 'PENDING_PAYMENT', 'PAID']);
const ORDER_KINDS = new Set<PublicOrderKind>(['PRODUCT', 'CONSULTATION']);
const FULFILLMENT_TYPES = new Set<PublicFulfillmentType>(['NATIONAL', 'INTERNATIONAL']);
const SHIPMENT_TYPES = new Set<PublicShipmentType>(['NATIONAL', 'INTERNATIONAL']);

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
  return true;
}

export async function loadPublicCharge(
  publicToken: string,
  signal?: AbortSignal,
): Promise<PublicChargeLoadResult> {
  try {
    const response = await fetch(
      `${API_BASE}/public/payment/${encodeURIComponent(publicToken)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      },
    );

    if (response.status === 404) return { kind: 'not_found' };
    if (response.status === 410) return { kind: 'gone' };
    if (response.status === 429 || response.status >= 500) return { kind: 'temporary_error' };
    if (!response.ok) return { kind: 'unexpected_response' };

    const payload: unknown = await response.json();
    if (!isPublicCharge(payload)) return { kind: 'unexpected_response' };

    return { kind: 'success', data: payload };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return { kind: 'temporary_error' };
  }
}

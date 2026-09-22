export type PublicOrderKind = 'PRODUCT' | 'CONSULTATION';
export type PublicOrderStatus = 'READY' | 'PENDING_PAYMENT' | 'PAID';
export type PublicFulfillmentType = 'NATIONAL' | 'INTERNATIONAL';
export type PublicShipmentType = 'NATIONAL' | 'INTERNATIONAL';

export type PublicChargeItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  fulfillmentType?: PublicFulfillmentType;
};

export type PublicChargeShipment = {
  type: PublicShipmentType;
  shippingAmount: number;
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
};

export type PublicCharge = {
  publicToken: string;
  orderStatus: PublicOrderStatus;
  orderKind?: PublicOrderKind;
  customerName: string;
  description?: string;
  items: PublicChargeItem[];
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  totalAmount: number;
  maxInstallments: number;
  shipments: PublicChargeShipment[];
  expiresAt?: string;
};

export type ShippingAddressInput = {
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string;
};

export type ShippingAddressPayload = {
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  country: 'BR';
  reference?: string;
};

export type PaymentMethod = 'PIX' | 'CREDIT_CARD';

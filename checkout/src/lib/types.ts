export type PublicOrderKind = 'PRODUCT' | 'CONSULTATION';
export type PublicOrderStatus = 'READY' | 'PENDING_PAYMENT' | 'PAID';
export type PublicFulfillmentType = 'NATIONAL' | 'INTERNATIONAL';
export type PublicShipmentType = 'NATIONAL' | 'INTERNATIONAL';
export type PaymentMethod = 'PIX' | 'CARD';
export type PublicPaymentStatus = 'PENDING' | 'CONFIRMED' | 'RECEIVED' | 'OVERDUE';

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

export type PublicActivePayment = {
  method: PaymentMethod;
  status: PublicPaymentStatus;
  amount: number;
  invoiceUrl?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  pixExpirationDate?: string;
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
  activePayment?: PublicActivePayment;
};

export type PublicPaymentStartResponse = {
  orderStatus: 'PENDING_PAYMENT' | 'PAID';
  activePayment?: PublicActivePayment;
};

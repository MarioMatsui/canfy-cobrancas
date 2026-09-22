import { formatMoney } from '@/lib/format';
import type { PublicCharge } from '@/lib/types';

export function PriceBreakdown({ charge }: { charge: PublicCharge }) {
  const shippingApplies = charge.orderKind === 'PRODUCT' || charge.shippingAmount > 0;
  return <div className="space-y-2 text-sm">
    <div className="flex items-center justify-between gap-4 text-slate-600"><span>Subtotal</span><span className="font-medium text-slate-800">{formatMoney(charge.subtotal)}</span></div>
    {charge.discountAmount>0&&<div className="flex items-center justify-between gap-4 text-canfy-700"><span>Desconto</span><span className="font-medium">− {formatMoney(charge.discountAmount)}</span></div>}
    {shippingApplies&&<div className="flex items-center justify-between gap-4 text-slate-600"><span>Frete</span><span className="font-medium text-slate-800">{formatMoney(charge.shippingAmount)}</span></div>}
    <div className="mt-3 flex items-end justify-between gap-4 border-t border-slate-200 pt-4"><div><p className="font-semibold text-slate-900">Total</p>{charge.maxInstallments>1&&<p className="mt-0.5 text-xs text-slate-500">Pagamento em até {charge.maxInstallments}x</p>}</div><span className="text-2xl font-bold tracking-tight text-slate-950">{formatMoney(charge.totalAmount)}</span></div>
  </div>;
}

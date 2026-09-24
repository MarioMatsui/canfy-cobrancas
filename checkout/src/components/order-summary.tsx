import { Clock3, Truck } from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { PublicCharge, PublicChargeShipment } from '@/lib/types';
import { OrderItems } from './order-items';
import { PriceBreakdown } from './price-breakdown';

function shipmentEstimate(shipment: PublicChargeShipment): string | null {
  const { estimatedDaysMin: min, estimatedDaysMax: max } = shipment;
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min} a ${max} dias`;
  return `${min ?? max} ${(min ?? max) === 1 ? 'dia' : 'dias'}`;
}

export function OrderSummary({ charge, compact = false }: { charge: PublicCharge; compact?: boolean }) {
  const expiresAt = charge.expiresAt ? formatDate(charge.expiresAt) : null;
  const estimates = charge.shipments
    .map((shipment) => ({ type: shipment.type, estimate: shipmentEstimate(shipment) }))
    .filter((entry): entry is { type: PublicChargeShipment['type']; estimate: string } => Boolean(entry.estimate));

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <p className="text-sm font-semibold text-slate-900">Resumo do pedido</p>
      </div>
      {!compact && (
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <OrderItems
            items={charge.items}
            showImages={charge.orderKind !== 'CONSULTATION'}
          />
        </div>
      )}
      <div className="px-5 py-5 sm:px-6"><PriceBreakdown charge={charge} /></div>
      {(expiresAt || estimates.length > 0) && !compact && (
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 text-xs text-slate-600 sm:px-6">
          {estimates.map((entry,index)=><div key={`${entry.type}-${index}`} className="flex items-center gap-2"><Truck aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400"/><span>{entry.type === 'INTERNATIONAL' ? 'Envio internacional' : 'Envio nacional'}: estimativa de {entry.estimate}</span></div>)}
          {expiresAt && <div className="flex items-center gap-2"><Clock3 aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400"/><span>Link disponível até {expiresAt}</span></div>}
        </div>
      )}
    </section>
  );
}

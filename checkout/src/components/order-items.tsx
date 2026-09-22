import { Package } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { PublicChargeItem } from '@/lib/types';

export function OrderItems({ items }: { items: PublicChargeItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.name + '-' + index} className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <Package aria-hidden="true" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium text-slate-800">{item.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {item.quantity} × {formatMoney(item.unitPrice)}
            </p>
          </div>
          <div className="shrink-0 pl-2 text-sm font-semibold text-slate-800">
            {formatMoney(item.lineTotal)}
          </div>
        </div>
      ))}
    </div>
  );
}

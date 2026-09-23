'use client';

import Image from 'next/image';
import { Package } from 'lucide-react';
import { useState } from 'react';
import { formatMoney } from '@/lib/format';
import type { PublicChargeItem, PublicProductType } from '@/lib/types';

const PRODUCT_TYPE_IMAGES: Partial<Record<PublicProductType, string>> = {
  OIL: '/tiposProduto/Óleo.jpg',
  GUMMY: '/tiposProduto/Comestíveis.png',
  CAPSULE: '/tiposProduto/Cápsulas.png',
  CREAM: '/tiposProduto/Cosméticos.png',
};

function productTypeImage(productType?: string): string | undefined {
  if (
    !productType ||
    !Object.prototype.hasOwnProperty.call(PRODUCT_TYPE_IMAGES, productType)
  ) {
    return undefined;
  }
  return PRODUCT_TYPE_IMAGES[productType as PublicProductType];
}

function DefaultProductPlaceholder() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
      <Package aria-hidden="true" className="h-5 w-5" />
    </div>
  );
}

function ProductVisual({ item }: { item: PublicChargeItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imagePath = productTypeImage(item.productType);

  if (!imagePath || imageFailed) {
    return <DefaultProductPlaceholder />;
  }

  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
      <Image
        src={imagePath}
        alt=""
        aria-hidden="true"
        fill
        sizes="40px"
        className="object-cover"
        onError={() => setImageFailed(true)}
      />
    </div>
  );
}

export function OrderItems({
  items,
  showImages = true,
}: {
  items: PublicChargeItem[];
  showImages?: boolean;
}) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.name + '-' + index} className="flex min-w-0 gap-3">
          {showImages && <ProductVisual item={item} />}
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

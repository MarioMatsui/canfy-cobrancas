-- Produtos internacionais passam a armazenar preço-base em USD.
-- Registros existentes permanecem explicitamente em BRL para evitar reinterpretar preços legados.
CREATE TYPE "ProductPriceCurrency" AS ENUM ('BRL', 'USD');

ALTER TABLE "products"
ADD COLUMN "price_currency" "ProductPriceCurrency" NOT NULL DEFAULT 'BRL';

-- Snapshot cambial da cobrança: mantém auditável o preço de origem e a taxa usada.
ALTER TABLE "charge_items"
ADD COLUMN "source_unit_price" DECIMAL(12,2),
ADD COLUMN "source_currency" "ProductPriceCurrency",
ADD COLUMN "exchange_rate" DECIMAL(12,6);

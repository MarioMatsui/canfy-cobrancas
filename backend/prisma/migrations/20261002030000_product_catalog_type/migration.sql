-- Adiciona o tipo comercial ao catálogo sem alterar produtos históricos existentes.
-- NULL é intencional para produtos legados ainda não revisados.
CREATE TYPE "ProductType" AS ENUM ('OIL', 'GUMMY', 'CAPSULE', 'CREAM', 'NASAL_SPRAY');

ALTER TABLE "products"
ADD COLUMN "product_type" "ProductType";

CREATE INDEX "products_product_type_idx" ON "products"("product_type");

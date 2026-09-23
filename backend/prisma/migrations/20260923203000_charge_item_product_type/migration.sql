-- Adiciona o tipo comercial como snapshot opcional do item.
-- NULL preserva cobrancas historicas e itens de consulta.
ALTER TABLE "charge_items"
ADD COLUMN "product_type" TEXT;

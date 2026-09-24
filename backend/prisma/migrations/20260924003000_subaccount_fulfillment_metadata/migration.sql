-- A modalidade de entrega passa a ser um metadado interno do fornecedor.
-- Nullable de propósito: fornecedores já existentes permanecem "não configurados"
-- até uma definição explícita no painel. Nenhum ChargeItem histórico é alterado.
ALTER TABLE "subaccounts"
ADD COLUMN "fulfillment_type" "FulfillmentType";

-- Médicos e outras subcontas não podem carregar uma modalidade de fornecedor.
-- SUPPLIER pode permanecer NULL somente para compatibilidade com dados legados;
-- a aplicação exige NATIONAL/INTERNATIONAL antes de usar/criar um fornecedor novo.
ALTER TABLE "subaccounts"
ADD CONSTRAINT "subaccounts_fulfillment_type_supplier_check"
CHECK (
  "type" = 'SUPPLIER'::"SubaccountType"
  OR "fulfillment_type" IS NULL
);

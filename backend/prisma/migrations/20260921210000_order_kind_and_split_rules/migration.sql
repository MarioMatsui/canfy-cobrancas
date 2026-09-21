-- =====================================================================
-- ETAPA 1 — identificar o tipo do pedido e separar regras de split
--
-- Historico permanece NULL em charges.order_kind porque as cobrancas
-- antigas nao tinham informacao suficiente para classifica-las com
-- seguranca como produto ou consulta.
-- =====================================================================

BEGIN;

CREATE TYPE "OrderKind" AS ENUM ('PRODUCT', 'CONSULTATION');

ALTER TABLE "charges"
  ADD COLUMN "order_kind" "OrderKind";

CREATE INDEX "charges_order_kind_idx" ON "charges"("order_kind");

COMMENT ON COLUMN "charges"."order_kind" IS
  'Tipo do pedido no fluxo novo. NULL identifica historico/legado nao classificado.';

INSERT INTO "settings" ("id", "key", "value", "description", "updated_at")
VALUES
  (gen_random_uuid()::text, 'product_supplier_percentage', '70',
   'Percentual do subtotal dos itens destinado ao fornecedor',
   (now() AT TIME ZONE 'utc')),
  (gen_random_uuid()::text, 'product_doctor_percentage', '5',
   'Percentual do subtotal dos itens destinado ao medico',
   (now() AT TIME ZONE 'utc')),
  (gen_random_uuid()::text, 'product_platform_percentage', '25',
   'Margem da CanFy sobre produtos antes de desconto e frete',
   (now() AT TIME ZONE 'utc')),
  (gen_random_uuid()::text, 'consultation_doctor_percentage', '85',
   'Percentual da consulta destinado ao medico',
   (now() AT TIME ZONE 'utc')),
  (gen_random_uuid()::text, 'consultation_platform_percentage', '15',
   'Margem da CanFy sobre consultas antes de desconto',
   (now() AT TIME ZONE 'utc'))
ON CONFLICT ("key") DO NOTHING;

COMMIT;

-- =====================================================================
-- MIGRATION 1 — payment_checkout_foundation
-- Projeto: Plataforma teste (nskiovgzhnoblnmjtcji)
--
-- O QUE FAZ:
--   - cria 5 tabelas novas: customers, products, charge_items, payments, shipments
--   - expande charges, charge_splits, split_results, webhook_logs
--   - faz backfill dos 65 registros existentes para o modelo novo
--
-- O QUE NAO FAZ:
--   - nao apaga nenhuma coluna
--   - nao apaga nenhuma linha
--   - nao altera charges.status (fica congelado como legado)
--
-- Roda inteiro dentro de uma transacao. Se qualquer passo falhar,
-- nada e aplicado.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- Nomes em PascalCase para seguir o padrao ja existente no banco
-- ("ChargeType", "SubaccountType", "UserRole").
-- ---------------------------------------------------------------------

CREATE TYPE "OrderStatus" AS ENUM (
  'DRAFT',            -- atendente ainda montando
  'READY',            -- validada, link gerado, precos travados
  'PENDING_PAYMENT',  -- cliente abriu o checkout / aguardando pagamento
  'PAID',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED'
);

CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENTAGE', 'FIXED');

CREATE TYPE "FulfillmentType" AS ENUM ('NATIONAL', 'INTERNATIONAL');

CREATE TYPE "PaymentProvider" AS ENUM ('ASAAS');

-- Vocabulario do Asaas, agora no lugar certo.
CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',   -- cartao aprovado, dinheiro ainda nao liquidado
  'RECEIVED',    -- dinheiro na conta
  'OVERDUE',
  'REFUNDED',
  'FAILED',      -- tentativa recusada (nao existe no Asaas, e nosso)
  'CANCELLED'
);

CREATE TYPE "ShipmentType" AS ENUM ('NATIONAL', 'INTERNATIONAL');

CREATE TYPE "ShipmentStatus" AS ENUM (
  'PENDING',
  'QUOTED',
  'LABEL_CREATED',
  'POSTED',
  'IN_TRANSIT',
  'DELIVERED',
  'RETURNED',
  'CANCELLED'
);

CREATE TYPE "QuoteSource" AS ENUM ('MANUAL', 'FIXED', 'MELHOR_ENVIO');

CREATE TYPE "SplitRecipientType" AS ENUM ('SUPPLIER', 'DOCTOR', 'PLATFORM');

CREATE TYPE "SplitCalculationType" AS ENUM ('PERCENTAGE', 'FIXED');


-- ---------------------------------------------------------------------
-- 2. TABELA customers
-- cpf_cnpj e a chave natural: esta preenchido em 100% das 65 cobrancas,
-- enquanto email falta em 12. Por isso o unique fica no CPF.
-- asaas_customer_id NAO e unique de proposito: hoje existem 39 CPFs
-- distintos para 40 customer_asaas_id, ou seja, ja ha CPF com mais de
-- um cadastro no Asaas.
-- ---------------------------------------------------------------------

CREATE TABLE "customers" (
    "id"                 TEXT NOT NULL,
    "name"               TEXT NOT NULL,
    "email"              TEXT,
    "cpf_cnpj"           TEXT NOT NULL,
    "phone"              TEXT,
    "asaas_customer_id"  TEXT,
    "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_cpf_cnpj_key" ON "customers"("cpf_cnpj");
CREATE INDEX "customers_email_idx" ON "customers"("email");
CREATE INDEX "customers_asaas_customer_id_idx" ON "customers"("asaas_customer_id");


-- ---------------------------------------------------------------------
-- 3. TABELA products (catalogo)
-- ---------------------------------------------------------------------

CREATE TABLE "products" (
    "id"                      TEXT NOT NULL,
    "name"                    TEXT NOT NULL,
    "sku"                     TEXT,
    "description"             TEXT,
    "supplier_subaccount_id"  TEXT,
    "default_price"           DECIMAL(12,2) NOT NULL,
    "fulfillment_type"        "FulfillmentType" NOT NULL DEFAULT 'NATIONAL',
    "active"                  BOOLEAN NOT NULL DEFAULT true,
    "created_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"              TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "products_supplier_subaccount_id_idx" ON "products"("supplier_subaccount_id");
CREATE INDEX "products_active_idx" ON "products"("active");

ALTER TABLE "products"
    ADD CONSTRAINT "products_supplier_subaccount_id_fkey"
    FOREIGN KEY ("supplier_subaccount_id") REFERENCES "subaccounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- 4. TABELA charge_items (produtos da venda)
-- product_id e opcional: o atendente pode escolher do catalogo OU
-- digitar uma linha avulsa.
-- product_name / unit_price sao SNAPSHOT. Se o preco do catalogo mudar
-- amanha, a venda antiga continua contando a verdade dela.
-- supplier_subaccount_id por ITEM resolve a limitacao de um fornecedor
-- por cobranca.
-- ---------------------------------------------------------------------

CREATE TABLE "charge_items" (
    "id"                      TEXT NOT NULL,
    "charge_id"               TEXT NOT NULL,
    "product_id"              TEXT,
    "product_name"            TEXT NOT NULL,
    "product_sku"             TEXT,
    "quantity"                INTEGER NOT NULL DEFAULT 1,
    "unit_price"              DECIMAL(12,2) NOT NULL,
    "line_total"              DECIMAL(12,2) NOT NULL,
    "supplier_subaccount_id"  TEXT,
    "fulfillment_type"        "FulfillmentType" NOT NULL DEFAULT 'NATIONAL',
    "created_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "charge_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "charge_items_charge_id_idx" ON "charge_items"("charge_id");
CREATE INDEX "charge_items_product_id_idx" ON "charge_items"("product_id");
CREATE INDEX "charge_items_supplier_subaccount_id_idx" ON "charge_items"("supplier_subaccount_id");

ALTER TABLE "charge_items"
    ADD CONSTRAINT "charge_items_charge_id_fkey"
    FOREIGN KEY ("charge_id") REFERENCES "charges"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "charge_items"
    ADD CONSTRAINT "charge_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "charge_items"
    ADD CONSTRAINT "charge_items_supplier_subaccount_id_fkey"
    FOREIGN KEY ("supplier_subaccount_id") REFERENCES "subaccounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- 5. TABELA payments
-- Aqui mora TUDO que e do Asaas. Uma venda pode ter varias tentativas
-- (cartao recusado -> PIX pago), coisa que o UNIQUE em charges.asaas_id
-- tornava impossivel.
-- billing_type continua TEXT (e nao enum) para acompanhar o vocabulario
-- do Asaas sem exigir migration a cada valor novo.
-- ---------------------------------------------------------------------

CREATE TABLE "payments" (
    "id"                   TEXT NOT NULL,
    "charge_id"            TEXT NOT NULL,
    "provider"             "PaymentProvider" NOT NULL DEFAULT 'ASAAS',
    "provider_payment_id"  TEXT,
    "billing_type"         TEXT NOT NULL,
    "amount"               DECIMAL(12,2) NOT NULL,
    "installments"         INTEGER NOT NULL DEFAULT 1,
    "status"               "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "invoice_url"          TEXT,
    "bank_slip_url"        TEXT,
    "pix_qr_code"          TEXT,
    "pix_copy_paste"       TEXT,
    "net_value"            DECIMAL(12,2),
    "failure_reason"       TEXT,
    "due_date"             TIMESTAMPTZ(6),
    "paid_at"              TIMESTAMPTZ(6),
    "created_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"           TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- O unique que estava em charges.asaas_id migra para ca.
CREATE UNIQUE INDEX "payments_provider_provider_payment_id_key"
    ON "payments"("provider", "provider_payment_id");
CREATE INDEX "payments_charge_id_idx" ON "payments"("charge_id");
CREATE INDEX "payments_status_idx" ON "payments"("status");

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_charge_id_fkey"
    FOREIGN KEY ("charge_id") REFERENCES "charges"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- 6. TABELA shipments
-- Sem unique em charge_id: uma venda com item nacional + item
-- internacional gera dois envios separados.
-- ---------------------------------------------------------------------

CREATE TABLE "shipments" (
    "id"                        TEXT NOT NULL,
    "charge_id"                 TEXT NOT NULL,
    "type"                      "ShipmentType" NOT NULL,
    "carrier"                   TEXT,
    "service"                   TEXT,
    "shipping_amount"           DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quote_source"              "QuoteSource" NOT NULL DEFAULT 'MANUAL',
    "destination_postal_code"   TEXT,
    "estimated_days_min"        INTEGER,
    "estimated_days_max"        INTEGER,
    "estimated_delivery_start"  TIMESTAMPTZ(6),
    "estimated_delivery_end"    TIMESTAMPTZ(6),
    "tracking_code"             TEXT,
    "tracking_url"              TEXT,
    "status"                    "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "external_id"               TEXT,
    "created_at"                TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"                TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shipments_charge_id_idx" ON "shipments"("charge_id");
CREATE INDEX "shipments_status_idx" ON "shipments"("status");
CREATE INDEX "shipments_tracking_code_idx" ON "shipments"("tracking_code");

ALTER TABLE "shipments"
    ADD CONSTRAINT "shipments_charge_id_fkey"
    FOREIGN KEY ("charge_id") REFERENCES "charges"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- 7. EXPANDIR charges
-- Nenhuma coluna antiga e removida ou alterada.
-- order_status e coluna NOVA. charges.status continua existindo com o
-- vocabulario do Asaas ate o dia do corte.
-- ---------------------------------------------------------------------

ALTER TABLE "charges"
    ADD COLUMN "customer_id"           TEXT,
    ADD COLUMN "created_by_user_id"    TEXT,
    ADD COLUMN "order_status"          "OrderStatus",
    ADD COLUMN "subtotal"              DECIMAL(12,2),
    ADD COLUMN "discount_type"         "DiscountType" NOT NULL DEFAULT 'NONE',
    ADD COLUMN "discount_value"        DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "discount_amount"       DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "shipping_amount"       DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "total_amount"          DECIMAL(12,2),
    ADD COLUMN "doctor_subaccount_id"  TEXT,
    ADD COLUMN "public_token"          TEXT,
    ADD COLUMN "expires_at"            TIMESTAMPTZ(6),
    ADD COLUMN "notes"                 TEXT;


-- ---------------------------------------------------------------------
-- 8. BACKFILL de charges (65 linhas)
--
-- Mapa de status (conforme combinado):
--   RECEIVED  -> PAID
--   CONFIRMED -> PAID
--   CANCELLED -> CANCELLED
--   PENDING   -> PENDING_PAYMENT
--   OVERDUE   -> PENDING_PAYMENT
--
-- subtotal = total_amount = value, porque as cobrancas antigas nao
-- tinham desconto nem frete separados.
-- ---------------------------------------------------------------------

UPDATE "charges" SET
    "subtotal"      = "value",
    "total_amount"  = "value",
    "public_token"  = gen_random_uuid()::text,
    "order_status"  = (CASE "status"
                          WHEN 'RECEIVED'  THEN 'PAID'
                          WHEN 'CONFIRMED' THEN 'PAID'
                          WHEN 'CANCELLED' THEN 'CANCELLED'
                          ELSE 'PENDING_PAYMENT'
                       END)::"OrderStatus"
WHERE "public_token" IS NULL;

-- Agora que todas as linhas tem valor, travamos como obrigatorio.
ALTER TABLE "charges"
    ALTER COLUMN "subtotal"     SET NOT NULL,
    ALTER COLUMN "total_amount" SET NOT NULL,
    ALTER COLUMN "public_token" SET NOT NULL,
    ALTER COLUMN "order_status" SET NOT NULL,
    ALTER COLUMN "order_status" SET DEFAULT 'DRAFT';

CREATE UNIQUE INDEX "charges_public_token_key" ON "charges"("public_token");
CREATE INDEX "charges_order_status_idx" ON "charges"("order_status");
CREATE INDEX "charges_customer_id_idx" ON "charges"("customer_id");
CREATE INDEX "charges_expires_at_idx" ON "charges"("expires_at");
CREATE INDEX "charges_created_by_user_id_idx" ON "charges"("created_by_user_id");
CREATE INDEX "charges_doctor_subaccount_id_idx" ON "charges"("doctor_subaccount_id");

ALTER TABLE "charges"
    ADD CONSTRAINT "charges_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "charges"
    ADD CONSTRAINT "charges_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "charges"
    ADD CONSTRAINT "charges_doctor_subaccount_id_fkey"
    FOREIGN KEY ("doctor_subaccount_id") REFERENCES "subaccounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON COLUMN "charges"."status" IS
  'LEGADO: guarda o status do Asaas. Use order_status para a venda e payments.status para o pagamento. Remover no corte.';
COMMENT ON COLUMN "charges"."charge_type" IS
  'LEGADO: REUSABLE foi descontinuado. 3 registros historicos mantidos. Nao oferecer no cobranca.canfy.';
COMMENT ON COLUMN "charges"."value" IS
  'LEGADO: substituido por total_amount. Mantido em sincronia ate o corte.';
COMMENT ON COLUMN "charges"."discount_value" IS
  'Se discount_type=PERCENTAGE, guarda o percentual (ex: 10). Se FIXED, guarda o valor em reais. O resultado calculado vai em discount_amount.';


-- ---------------------------------------------------------------------
-- 9. BACKFILL de customers a partir das cobrancas
-- Deduplicado por CPF/CNPJ, mantendo o cadastro mais recente.
-- (Se preferir comecar com customers vazia, apague este bloco inteiro.)
-- ---------------------------------------------------------------------

INSERT INTO "customers" ("id", "name", "email", "cpf_cnpj", "asaas_customer_id", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    c."customer_name",
    c."customer_email",
    c."customer_cpf_cnpj",
    c."customer_asaas_id",
    now(),
    now()
FROM (
    SELECT DISTINCT ON ("customer_cpf_cnpj") *
    FROM "charges"
    WHERE "customer_cpf_cnpj" IS NOT NULL
    ORDER BY "customer_cpf_cnpj", "created_at" DESC
) c;

UPDATE "charges" ch
SET "customer_id" = cu."id"
FROM "customers" cu
WHERE cu."cpf_cnpj" = ch."customer_cpf_cnpj"
  AND ch."customer_id" IS NULL;


-- ---------------------------------------------------------------------
-- 10. BACKFILL de payments a partir das cobrancas
-- As 65 cobrancas tem asaas_id preenchido, entao o mapeamento e 1:1.
-- Os timestamps antigos sao `timestamp without time zone` gravados em
-- UTC pelo Prisma, por isso o AT TIME ZONE 'UTC'.
-- ---------------------------------------------------------------------

INSERT INTO "payments" (
    "id", "charge_id", "provider", "provider_payment_id", "billing_type",
    "amount", "installments", "status",
    "invoice_url", "bank_slip_url", "pix_qr_code", "pix_copy_paste",
    "net_value", "due_date", "paid_at", "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text,
    c."id",
    'ASAAS',
    c."asaas_id",
    c."billing_type",
    c."value",
    c."max_installments",
    (CASE c."status"
        WHEN 'RECEIVED'  THEN 'RECEIVED'
        WHEN 'CONFIRMED' THEN 'CONFIRMED'
        WHEN 'OVERDUE'   THEN 'OVERDUE'
        WHEN 'CANCELLED' THEN 'CANCELLED'
        ELSE 'PENDING'
     END)::"PaymentStatus",
    c."invoice_url",
    c."bank_slip_url",
    c."pix_qr_code",
    c."pix_copia_e_cola",
    c."net_value",
    c."due_date"   AT TIME ZONE 'UTC',
    CASE WHEN c."status" IN ('RECEIVED', 'CONFIRMED')
         THEN c."updated_at" AT TIME ZONE 'UTC' END,
    c."created_at" AT TIME ZONE 'UTC',
    now()
FROM "charges" c
WHERE c."asaas_id" IS NOT NULL;


-- ---------------------------------------------------------------------
-- 11. EXPANDIR charge_splits
-- O objetivo e tornar o calculo auditavel: nao basta saber "85%",
-- e preciso saber sobre QUAL valor e QUANTO deu.
-- ---------------------------------------------------------------------

ALTER TABLE "charge_splits"
    ADD COLUMN "recipient_type"    "SplitRecipientType",
    ADD COLUMN "charge_item_id"    TEXT,
    ADD COLUMN "calculation_type"  "SplitCalculationType",
    ADD COLUMN "basis_amount"      DECIMAL(12,2),
    ADD COLUMN "calculated_value"  DECIMAL(12,2),
    ADD COLUMN "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now();

UPDATE "charge_splits" cs
SET "recipient_type"   = (CASE s."type"
                             WHEN 'DOCTOR'   THEN 'DOCTOR'
                             WHEN 'SUPPLIER' THEN 'SUPPLIER'
                             ELSE 'PLATFORM'
                          END)::"SplitRecipientType",
    "calculation_type" = (CASE WHEN cs."percentage" IS NOT NULL
                               THEN 'PERCENTAGE' ELSE 'FIXED'
                          END)::"SplitCalculationType"
FROM "subaccounts" s
WHERE s."id" = cs."subaccount_id";

ALTER TABLE "charge_splits"
    ALTER COLUMN "recipient_type"   SET NOT NULL,
    ALTER COLUMN "calculation_type" SET NOT NULL;

-- Corrige o apontamento do Performance Advisor (FK sem indice).
CREATE INDEX "charge_splits_subaccount_id_idx" ON "charge_splits"("subaccount_id");
CREATE INDEX "charge_splits_charge_item_id_idx" ON "charge_splits"("charge_item_id");

ALTER TABLE "charge_splits"
    ADD CONSTRAINT "charge_splits_charge_item_id_fkey"
    FOREIGN KEY ("charge_item_id") REFERENCES "charge_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- 12. EXPANDIR split_results (ligar ao pagamento)
-- Conceitualmente o split acontece num PAGAMENTO, nao numa venda.
-- ---------------------------------------------------------------------

ALTER TABLE "split_results"
    ADD COLUMN "payment_id" TEXT;

UPDATE "split_results" sr
SET "payment_id" = p."id"
FROM "payments" p
WHERE p."charge_id" = sr."charge_id";

CREATE INDEX "split_results_payment_id_idx" ON "split_results"("payment_id");

ALTER TABLE "split_results"
    ADD CONSTRAINT "split_results_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- 13. EXPANDIR webhook_logs
-- provider_event_id com UNIQUE da idempotencia: se o Asaas reenviar o
-- mesmo evento, o insert falha e voce ignora em vez de processar duas
-- vezes. A tabela esta vazia hoje (0 linhas), entao nao ha backfill.
-- ---------------------------------------------------------------------

ALTER TABLE "webhook_logs"
    ADD COLUMN "provider"          "PaymentProvider" NOT NULL DEFAULT 'ASAAS',
    ADD COLUMN "provider_event_id" TEXT,
    ADD COLUMN "payment_id"        TEXT,
    ADD COLUMN "processed_at"      TIMESTAMPTZ(6),
    ADD COLUMN "error_message"     TEXT;

CREATE UNIQUE INDEX "webhook_logs_provider_event_id_key" ON "webhook_logs"("provider_event_id");
CREATE INDEX "webhook_logs_payment_id_idx" ON "webhook_logs"("payment_id");

ALTER TABLE "webhook_logs"
    ADD CONSTRAINT "webhook_logs_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- 14. SETTINGS novas
-- Valores em tabela em vez de hardcoded no codigo.
-- ---------------------------------------------------------------------

INSERT INTO "settings" ("id", "key", "value", "description", "updated_at")
VALUES
  (gen_random_uuid()::text, 'international_shipping_default', '150.00',
   'Frete internacional padrao (R$) quando nao ha cotacao',
   (now() AT TIME ZONE 'utc')),
  (gen_random_uuid()::text, 'charge_link_expiration_days', '7',
   'Dias de validade do link de pagamento gerado (charges.expires_at)',
   (now() AT TIME ZONE 'utc')),
  (gen_random_uuid()::text, 'checkout_base_url', 'https://pagar.canfy.com.br',
   'Base do link publico montado com charges.public_token',
   (now() AT TIME ZONE 'utc')),
  (gen_random_uuid()::text, 'platform_fee_percentage', '15',
   'Percentual retido pela CanFy quando nao ha regra especifica',
   (now() AT TIME ZONE 'utc'))
ON CONFLICT ("key") DO NOTHING;


-- ---------------------------------------------------------------------
-- 15. OPCIONAL — gerar um charge_item para as cobrancas antigas
--
-- Descomente SE voce quiser que o historico tambem apareca no formato
-- novo (util se o cobranca.canfy for listar itens para toda cobranca).
-- Deixei desligado porque isso cria dados que nao existiam: as 65
-- cobrancas antigas nao tinham produto discriminado.
-- ---------------------------------------------------------------------

-- INSERT INTO "charge_items" (
--     "id", "charge_id", "product_name", "quantity",
--     "unit_price", "line_total", "fulfillment_type", "created_at"
-- )
-- SELECT
--     gen_random_uuid()::text,
--     c."id",
--     COALESCE(NULLIF(c."description", ''), 'Item migrado'),
--     1,
--     c."value",
--     c."value",
--     'NATIONAL',
--     now()
-- FROM "charges" c;


COMMIT;


-- =====================================================================
-- VERIFICACAO (rode depois, fora da transacao)
-- =====================================================================
-- SELECT order_status, status, COUNT(*)
--   FROM charges GROUP BY 1,2 ORDER BY 1,2;
--
-- SELECT COUNT(*) AS charges, COUNT(public_token) AS com_token,
--        COUNT(DISTINCT public_token) AS tokens_unicos
--   FROM charges;                       -- os 3 numeros devem bater: 65
--
-- SELECT COUNT(*) FROM payments;        -- esperado: 65
-- SELECT COUNT(*) FROM customers;       -- esperado: 39
-- SELECT COUNT(*) FROM split_results WHERE payment_id IS NULL;  -- 0

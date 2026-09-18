-- =====================================================================
-- MIGRATION 3 — shipping_address_and_packaging
-- Projeto: Plataforma teste (nskiovgzhnoblnmjtcji)
--
-- O QUE FAZ:
--   - cria shipping_addresses (endereco coletado no pagar.canfy)
--   - adiciona peso e dimensoes OPCIONAIS em products
--   - grava a caixa padrao e o CEP de origem em settings
--   - liga shipments ao endereco
--
-- POR QUE ESTA E SEGURA (diferente da migration 1):
--   nenhuma coluna NOT NULL e adicionada a tabela existente. products
--   esta vazia e as colunas novas sao nullable; shipping_addresses e
--   tabela nova. O codigo antigo continua inserindo sem saber que isso
--   existe. Nao precisa de trigger de transicao.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. shipping_addresses
--
-- Um endereco por cobranca (UNIQUE em charge_id). O cliente preenche o
-- formulario no pagar.canfy antes de escolher a forma de pagamento.
--
-- customer_id e opcional e serve so para reaproveitamento futuro
-- ("usar meu endereco anterior"). O registro em si e SNAPSHOT do
-- pedido, pelo mesmo motivo que customer_name esta em charges: se o
-- cliente mudar de casa, o pedido antigo nao deve mudar de destino.
-- ---------------------------------------------------------------------

CREATE TABLE "shipping_addresses" (
    "id"               TEXT NOT NULL,
    "charge_id"        TEXT NOT NULL,
    "customer_id"      TEXT,

    -- quem recebe pode nao ser quem comprou
    "recipient_name"   TEXT,
    "recipient_phone"  TEXT,

    "postal_code"      TEXT NOT NULL,   -- so digitos, 8 caracteres
    "street"           TEXT NOT NULL,
    "number"           TEXT NOT NULL,   -- TEXT por causa de "S/N" e "123-A"
    "complement"       TEXT,
    "neighborhood"     TEXT NOT NULL,
    "city"             TEXT NOT NULL,
    "state"            TEXT NOT NULL,   -- UF, 2 letras
    "country"          TEXT NOT NULL DEFAULT 'BR',
    "reference"        TEXT,            -- ponto de referencia

    "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"       TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipping_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shipping_addresses_charge_id_key" ON "shipping_addresses"("charge_id");
CREATE INDEX "shipping_addresses_customer_id_idx" ON "shipping_addresses"("customer_id");
CREATE INDEX "shipping_addresses_postal_code_idx" ON "shipping_addresses"("postal_code");

ALTER TABLE "shipping_addresses"
    ADD CONSTRAINT "shipping_addresses_charge_id_fkey"
    FOREIGN KEY ("charge_id") REFERENCES "charges"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shipping_addresses"
    ADD CONSTRAINT "shipping_addresses_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON COLUMN "shipping_addresses"."postal_code" IS
  'Somente digitos, 8 caracteres. Normalizar na aplicacao antes de gravar.';


-- ---------------------------------------------------------------------
-- 2. Peso e dimensoes em products — TODAS OPCIONAIS
--
-- Unidades conforme a API do Melhor Envio: dimensoes em centimetros,
-- peso em quilogramas.
--
-- Ficam nulas de proposito. Quando nulas, a cotacao usa a caixa padrao
-- de settings. Preencha so nos produtos que fogem do padrao (kits,
-- caixas maiores).
-- ---------------------------------------------------------------------

ALTER TABLE "products"
    ADD COLUMN "weight_kg" DECIMAL(8,3),
    ADD COLUMN "height_cm" DECIMAL(8,2),
    ADD COLUMN "width_cm"  DECIMAL(8,2),
    ADD COLUMN "length_cm" DECIMAL(8,2);

COMMENT ON COLUMN "products"."weight_kg" IS
  'Peso em kg (API Melhor Envio). Nulo = usa default_package_weight_kg de settings.';
COMMENT ON COLUMN "products"."height_cm" IS
  'Dimensoes em cm (API Melhor Envio). Nulas = usa a caixa padrao de settings.';


-- ---------------------------------------------------------------------
-- 3. Ligar o envio ao endereco
-- ---------------------------------------------------------------------

ALTER TABLE "shipments"
    ADD COLUMN "shipping_address_id" TEXT;

CREATE INDEX "shipments_shipping_address_id_idx" ON "shipments"("shipping_address_id");

ALTER TABLE "shipments"
    ADD CONSTRAINT "shipments_shipping_address_id_fkey"
    FOREIGN KEY ("shipping_address_id") REFERENCES "shipping_addresses"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- 4. Caixa padrao e origem em settings
--
-- Valores conforme a configuracao atual do Melhor Envio.
-- Estao em settings e nao no codigo para poderem ser ajustados sem
-- deploy quando a embalagem mudar.
-- ---------------------------------------------------------------------

INSERT INTO "settings" ("id", "key", "value", "description", "updated_at")
VALUES
  (gen_random_uuid()::text, 'shipping_origin_postal_code', '01258000',
   'CEP de origem das postagens (somente digitos)',
   (now() AT TIME ZONE 'utc')),

  (gen_random_uuid()::text, 'default_package_format', 'box',
   'Formato padrao do pacote: box, envelope ou roll',
   (now() AT TIME ZONE 'utc')),

  (gen_random_uuid()::text, 'default_package_height_cm', '20',
   'Altura da caixa padrao em cm',
   (now() AT TIME ZONE 'utc')),

  (gen_random_uuid()::text, 'default_package_width_cm', '20',
   'Largura da caixa padrao em cm',
   (now() AT TIME ZONE 'utc')),

  (gen_random_uuid()::text, 'default_package_length_cm', '20',
   'Comprimento da caixa padrao em cm',
   (now() AT TIME ZONE 'utc')),

  (gen_random_uuid()::text, 'default_package_weight_kg', '0.3',
   'Peso da caixa padrao em kg (equivale a faixa ate 300g)',
   (now() AT TIME ZONE 'utc'))
ON CONFLICT ("key") DO NOTHING;

COMMIT;


-- =====================================================================
-- VERIFICACAO (rode depois)
-- =====================================================================
-- SELECT key, value FROM settings
--  WHERE key LIKE 'default_package%' OR key = 'shipping_origin_postal_code'
--  ORDER BY key;                                  -- esperado: 6 linhas
--
-- SELECT column_name, is_nullable FROM information_schema.columns
--  WHERE table_name = 'products'
--    AND column_name IN ('weight_kg','height_cm','width_cm','length_cm');
--                                                 -- todas YES
--
-- SELECT count(*) FROM shipping_addresses;        -- esperado: 0

-- Catalogo global e relacao N:N; nenhuma alteracao em produtos historicos/financeiros.
CREATE TABLE "phytocannabinoids" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "normalized_name" VARCHAR(80) NOT NULL,
  "full_name" VARCHAR(120),
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "phytocannabinoids_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "phytocannabinoids_normalized_name_key"
  ON "phytocannabinoids" ("normalized_name");

CREATE TABLE "product_phytocannabinoids" (
  "product_id" TEXT NOT NULL,
  "phytocannabinoid_id" TEXT NOT NULL,
  CONSTRAINT "product_phytocannabinoids_pkey"
    PRIMARY KEY ("product_id", "phytocannabinoid_id")
);

CREATE INDEX "product_phytocannabinoids_phytocannabinoid_id_idx"
  ON "product_phytocannabinoids" ("phytocannabinoid_id");

ALTER TABLE "product_phytocannabinoids"
  ADD CONSTRAINT "product_phytocannabinoids_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_phytocannabinoids"
  ADD CONSTRAINT "product_phytocannabinoids_phytocannabinoid_id_fkey"
  FOREIGN KEY ("phytocannabinoid_id") REFERENCES "phytocannabinoids"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valores globais iniciais. IDs deterministas e ON CONFLICT tornam o seed idempotente.
-- Termos comerciais de spectrum/isolado nao sao fitocanabinoides.
INSERT INTO "phytocannabinoids"
  ("id", "name", "normalized_name", "full_name", "is_default")
VALUES
  ('00000000-0000-4000-8000-000000000001', 'CBD',  'cbd',  'Canabidiol', true),
  ('00000000-0000-4000-8000-000000000002', 'THC',  'thc',  'Tetrahidrocanabinol', true),
  ('00000000-0000-4000-8000-000000000003', 'CBG',  'cbg',  'Canabigerol', true),
  ('00000000-0000-4000-8000-000000000004', 'CBN',  'cbn',  'Canabinol', true),
  ('00000000-0000-4000-8000-000000000005', 'CBC',  'cbc',  'Canabicromeno', true),
  ('00000000-0000-4000-8000-000000000006', 'THCV', 'thcv', 'Tetrahidrocanabivarina', true),
  ('00000000-0000-4000-8000-000000000007', 'CBDV', 'cbdv', 'Canabidivarina', true),
  ('00000000-0000-4000-8000-000000000008', 'CBDA', 'cbda', 'Ácido canabidiólico', true),
  ('00000000-0000-4000-8000-000000000009', 'THCA', 'thca', 'Ácido tetrahidrocanabinólico', true),
  ('00000000-0000-4000-8000-000000000010', 'CBGA', 'cbga', 'Ácido canabigerólico', true),
  ('00000000-0000-4000-8000-000000000011', 'CBCA', 'cbca', 'Ácido canabicromênico', true)
ON CONFLICT ("normalized_name") DO NOTHING;

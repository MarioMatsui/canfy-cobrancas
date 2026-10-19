-- Optional metadata only: existing products remain valid.
ALTER TABLE "products"
  ADD COLUMN "brand" VARCHAR(120),
  ADD COLUMN "image_url" VARCHAR(2048),
  ADD COLUMN "coa_url" VARCHAR(2048),
  ADD COLUMN "coa_batch" VARCHAR(120),
  ADD COLUMN "coa_analyzed_at" DATE,
  ADD COLUMN "coa_valid_until" DATE;
CREATE INDEX "products_brand_idx" ON "products" ("brand");

-- Stage 3: trace integration-created charges and make create retries idempotent.
ALTER TABLE "charges"
  ADD COLUMN "created_by_integration_id" TEXT,
  ADD COLUMN "integration_idempotency_key" TEXT,
  ADD COLUMN "integration_request_hash" TEXT;

CREATE INDEX "charges_created_by_integration_id_idx"
  ON "charges"("created_by_integration_id");

CREATE UNIQUE INDEX "charges_integration_idempotency_key"
  ON "charges"("created_by_integration_id", "integration_idempotency_key");

ALTER TABLE "charges"
  ADD CONSTRAINT "charges_created_by_integration_id_fkey"
  FOREIGN KEY ("created_by_integration_id")
  REFERENCES "integration_api_keys"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Versioned safety ledger for remote Asaas account creations.
-- No existing subaccounts, splits or charges are modified.
CREATE TYPE "SubaccountCreationStatus" AS ENUM
 ('SENDING','RESPONSE_RECEIVED','COMPLETED','NEEDS_RECONCILIATION');
CREATE TABLE "subaccount_create_operations" (
 "id" TEXT NOT NULL,
 "idempotency_key" VARCHAR(100) NOT NULL,
 "request_hash" VARCHAR(64) NOT NULL,
 "status" "SubaccountCreationStatus" NOT NULL DEFAULT 'SENDING',
 "remote_account_id" VARCHAR(100),
 "local_subaccount_id" TEXT,
 "error_code" VARCHAR(64),
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "subaccount_create_operations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subaccount_create_operations_idempotency_key_key"
 ON "subaccount_create_operations" ("idempotency_key");
CREATE INDEX "subaccount_create_operations_status_created_at_idx"
 ON "subaccount_create_operations" ("status","created_at");

-- CreateEnum
CREATE TYPE "IntegrationApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "integration_api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "status" "IntegrationApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "created_by_user_id" TEXT,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "integration_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_api_keys_key_prefix_key" ON "integration_api_keys"("key_prefix");

-- CreateIndex
CREATE UNIQUE INDEX "integration_api_keys_key_hash_key" ON "integration_api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "integration_api_keys_status_idx" ON "integration_api_keys"("status");

-- CreateIndex
CREATE INDEX "integration_api_keys_created_by_user_id_idx" ON "integration_api_keys"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "integration_api_keys"
ADD CONSTRAINT "integration_api_keys_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Pairing is explicitly approved by Canfy ADMIN and claimed by an authenticated MsgDesk ADMIN.
-- This migration does not modify existing integration scopes, tenants or medical records.
ALTER TABLE "integration_api_keys"
  ADD COLUMN "doctor_pair_code_hash" VARCHAR(64),
  ADD COLUMN "doctor_pair_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "doctor_pair_requested_by_user_id" TEXT;
CREATE TABLE "integration_doctor_pairing_events" (
  "id" TEXT NOT NULL,
  "integration_key_id" TEXT NOT NULL,
  "organization_id" UUID NOT NULL,
  "initiated_by_canfy_user_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_doctor_pairing_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "integration_doctor_pairing_key_created_idx"
  ON "integration_doctor_pairing_events" ("integration_key_id","created_at");
CREATE TABLE "doctor_organization_link_events" (
  "id" TEXT NOT NULL,
  "doctor_id" TEXT NOT NULL,
  "organization_id" UUID NOT NULL,
  "integration_key_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "doctor_organization_link_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "doctor_organization_link_events_doctor_id_created_at_idx"
  ON "doctor_organization_link_events" ("doctor_id","created_at");

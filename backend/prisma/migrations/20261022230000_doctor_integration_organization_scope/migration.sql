-- Additive: NULL is intentionally denied for v2 doctor-admin integrations.
-- Existing credentials do not receive new scopes, and old API contracts remain unchanged.
ALTER TABLE "integration_api_keys"
 ADD COLUMN "doctor_organization_id" UUID;
CREATE INDEX "integration_api_keys_doctor_organization_id_idx"
 ON "integration_api_keys" ("doctor_organization_id");

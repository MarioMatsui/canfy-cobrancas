-- Append-only actor audit metadata for unified medical onboarding.
-- Existing doctor operations are retained; legacy rows have NULL actor_user_id.
ALTER TABLE "doctor_provisioning_operations"
  ADD COLUMN "actor_user_id" TEXT;
CREATE INDEX "doctor_provisioning_operations_actor_user_id_created_at_idx"
  ON "doctor_provisioning_operations" ("actor_user_id", "created_at");

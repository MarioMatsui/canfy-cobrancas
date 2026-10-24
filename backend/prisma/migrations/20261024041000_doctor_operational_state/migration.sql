-- Only administratively VERIFIED and non-blocked legacy physicians are enabled.
-- Review existing rows before deploying. No financial data are changed.
ALTER TABLE "doctors" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT false;
UPDATE "doctors" SET "enabled"=true WHERE "registration_status"='VERIFIED'
 AND "verified_at" IS NOT NULL AND "provisioning_status"<>'BLOCKED';

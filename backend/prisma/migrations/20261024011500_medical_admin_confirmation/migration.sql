-- No fabricated documentary protocol: authenticated actor and timestamp remain recorded.
ALTER TABLE "doctor_review_events" ALTER COLUMN "evidence_reference" DROP NOT NULL;
ALTER TABLE "doctor_review_events" DROP CONSTRAINT IF EXISTS "doctor_review_events_reference_check";
ALTER TABLE "doctor_review_events" ADD CONSTRAINT "doctor_review_events_reference_check"
  CHECK ("evidence_reference" IS NULL OR length(trim("evidence_reference")) >= 8);
ALTER TABLE "doctor_organization_link_events" ALTER COLUMN "evidence_reference" DROP NOT NULL;
-- Fail safely on pre-existing conflicts; never silently merge financial identities.
CREATE UNIQUE INDEX IF NOT EXISTS "doctor_financial_links_one_active_per_doctor"
  ON "doctor_financial_links" ("doctor_id") WHERE "active" = true;
CREATE UNIQUE INDEX IF NOT EXISTS "doctor_financial_links_one_active_per_subaccount"
  ON "doctor_financial_links" ("subaccount_id") WHERE "active" = true;

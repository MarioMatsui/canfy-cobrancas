-- Doctor-only audit of manual registry review. No changes to financial subaccounts or splits.
CREATE TABLE "doctor_review_events" (
 "id" TEXT NOT NULL,
 "doctor_id" TEXT NOT NULL,
 "license_id" TEXT NOT NULL,
 "actor_user_id" TEXT NOT NULL,
 "evidence_reference" VARCHAR(250) NOT NULL,
 "decision" VARCHAR(16) NOT NULL,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "doctor_review_events_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "doctor_review_events_decision_check" CHECK ("decision" IN ('VERIFIED','REJECTED')),
 CONSTRAINT "doctor_review_events_reference_check" CHECK (length(trim("evidence_reference")) >= 8)
);
CREATE INDEX "doctor_review_events_doctor_id_created_at_idx" ON "doctor_review_events" ("doctor_id","created_at");
ALTER TABLE "doctor_review_events" ADD CONSTRAINT "doctor_review_events_doctor_id_fkey"
 FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctor_review_events" ADD CONSTRAINT "doctor_review_events_license_id_fkey"
 FOREIGN KEY ("license_id") REFERENCES "doctor_licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

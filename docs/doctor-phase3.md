# Stage 3: Professional Doctor record and MsgDesk linkage

**Status: draft code only, no production database migrations or deploy.**

## Core

- Professional data remains in `Doctor`/`DoctorLicense` and one central Canfy
  PostgreSQL. Existing Subaccounts, wallets, splits, Charge.doctorSubaccountId
  and financial `/api/integrations/v1/doctors` were not intentionally changed.
- The new professional section is added next to, not instead of, the
  existing subaccounts page. Registration and `regularize` do not create
  financial subaccounts or call Asaas.
- Legacy `/api/doctors/legacy-candidates` and manual financial
  linking remain behind Canfy JWT ADMIN; not exposed to MsgDesk v2.
- Registration statuses are independent from provisioning, financial
  and CRM-license statuses. `PENDING_REVIEW` never means verified.
- Verified CRM requires an explicit JWT ADMIN manual review with
  evidence reference; no official council API lookup is simulated.

## New contracts

- `POST /api/doctors/:id/licenses/review`: JWT ADMIN, licensed ID,
  decision VERIFIED/REJECTED, evidenceReference of prior actual
  independent council verification. Stores immutable `doctor_review_events`.
  New Prisma migration `20261023040000_doctor_manual_review_audit`.
- `POST /api/integrations/v2/admin/doctors/:id/provisioning/confirm`:
  integration read/write-scoped key + trusted doctorOrganizationId,
  UUID Auth id and `Idempotency-Key`. Refuses other tenants, unverified
  professionals and existing other UID. Records durable operation; links
  identity only. Never creates an Asaas wallet.
- `POST /api/integrations/v2/admin/doctors/:id/provisioning/activate-clinical`:
  scoped write, matching UID, verified CRM and status, idempotent operation.
  Sets `Doctor.accessActive` independently of splits/financial eligibility.
- V2 responses for detail/update/license/regularize redact financial wallet
  identifiers; v1 financial doctor contract remains untouched.

## Blocking limits before merge/deploy

- Reverse Canfy -> MsgDesk provisioning cannot be turned on until a
  *verified* organization association and authenticated reverse protocol
  exists; unassociated doctors remain pending, not auto-published.
  The original `prepareProvisioning` endpoint remains fail-closed.
- PostgreSQL live migration and existing doctors' real records not validated
  by a database connection here; do NOT claim migrations installed.
- Cross-system replay/reconciliation still requires a tested recovery design.
- Need tests in a disposable Canfy PostgreSQL + mocked Asaas, staging
  Supabase, and end-to-end browser. No real financial calls or migrations
  performed.
- Keep PR draft until CI, DTO/Prisma validation, scoped integration tests,
  RLS/HTTP negative tests and security review pass.

-- Garante idempotencia material dos resultados de split do fluxo novo.
-- Registros legados continuam podendo ter payment_id NULL.
BEGIN;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "payment_id", "receiver_subaccount_id"
      ORDER BY "created_at" DESC, "id" DESC
    ) AS row_number
  FROM "split_results"
  WHERE "payment_id" IS NOT NULL
)
DELETE FROM "split_results"
WHERE "id" IN (
  SELECT "id"
  FROM ranked
  WHERE row_number > 1
);

CREATE UNIQUE INDEX
  "split_results_payment_id_receiver_subaccount_id_key"
  ON "split_results"("payment_id", "receiver_subaccount_id");

COMMIT;

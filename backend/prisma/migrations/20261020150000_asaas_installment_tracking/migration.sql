-- Uma tentativa Payment representa o valor total da venda.
-- O grupo Asaas e suas cobranças individuais são rastreados separadamente.
ALTER TABLE "payments" ADD COLUMN "provider_installment_id" TEXT;
CREATE INDEX "payments_provider_installment_id_idx" ON "payments"("provider_installment_id");

CREATE TABLE "payment_installments" (
  "id" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "provider_payment_id" TEXT NOT NULL,
  "installment_number" INTEGER NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_installments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_installments_provider_payment_id_key" ON "payment_installments"("provider_payment_id");
CREATE UNIQUE INDEX "payment_installments_payment_id_installment_number_key" ON "payment_installments"("payment_id", "installment_number");
CREATE INDEX "payment_installments_payment_id_idx" ON "payment_installments"("payment_id");
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

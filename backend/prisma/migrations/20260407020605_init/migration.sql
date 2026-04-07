-- CreateEnum
CREATE TYPE "SubaccountType" AS ENUM ('DOCTOR', 'SUPPLIER', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('CUSTOM', 'REUSABLE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subaccounts" (
    "id" TEXT NOT NULL,
    "asaas_id" TEXT NOT NULL,
    "wallet_id" TEXT,
    "name" TEXT NOT NULL,
    "cpf_cnpj" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "mobile_phone" TEXT,
    "type" "SubaccountType" NOT NULL DEFAULT 'OTHER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subaccounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charges" (
    "id" TEXT NOT NULL,
    "asaas_id" TEXT,
    "charge_type" "ChargeType" NOT NULL DEFAULT 'CUSTOM',
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT,
    "customer_cpf_cnpj" TEXT,
    "customer_asaas_id" TEXT,
    "billing_type" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "due_date" TIMESTAMP(3),
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "max_installments" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "invoice_url" TEXT,
    "bank_slip_url" TEXT,
    "pix_qr_code" TEXT,
    "pix_copia_e_cola" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_splits" (
    "id" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "subaccount_id" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "charge_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split_results" (
    "id" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "receiver_subaccount_id" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "split_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subaccounts_asaas_id_key" ON "subaccounts"("asaas_id");

-- CreateIndex
CREATE INDEX "subaccounts_type_idx" ON "subaccounts"("type");

-- CreateIndex
CREATE UNIQUE INDEX "charges_asaas_id_key" ON "charges"("asaas_id");

-- CreateIndex
CREATE INDEX "charges_status_idx" ON "charges"("status");

-- CreateIndex
CREATE INDEX "charges_charge_type_idx" ON "charges"("charge_type");

-- CreateIndex
CREATE INDEX "charges_due_date_idx" ON "charges"("due_date");

-- CreateIndex
CREATE INDEX "charges_is_active_idx" ON "charges"("is_active");

-- CreateIndex
CREATE INDEX "charge_splits_charge_id_idx" ON "charge_splits"("charge_id");

-- CreateIndex
CREATE INDEX "split_results_charge_id_idx" ON "split_results"("charge_id");

-- CreateIndex
CREATE INDEX "split_results_receiver_subaccount_id_idx" ON "split_results"("receiver_subaccount_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "webhook_logs_event_idx" ON "webhook_logs"("event");

-- CreateIndex
CREATE INDEX "webhook_logs_created_at_idx" ON "webhook_logs"("created_at");

-- AddForeignKey
ALTER TABLE "charge_splits" ADD CONSTRAINT "charge_splits_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_splits" ADD CONSTRAINT "charge_splits_subaccount_id_fkey" FOREIGN KEY ("subaccount_id") REFERENCES "subaccounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_results" ADD CONSTRAINT "split_results_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_results" ADD CONSTRAINT "split_results_receiver_subaccount_id_fkey" FOREIGN KEY ("receiver_subaccount_id") REFERENCES "subaccounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "subaccounts" ADD COLUMN     "activation_resent_at" TIMESTAMP(3),
ADD COLUMN     "asaas_general_status" TEXT,
ADD COLUMN     "asaas_status_checked_at" TIMESTAMP(3);

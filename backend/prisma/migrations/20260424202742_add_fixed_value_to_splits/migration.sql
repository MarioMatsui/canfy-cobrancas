-- AlterTable
ALTER TABLE "charge_splits" ADD COLUMN     "fixed_value" DECIMAL(12,2),
ALTER COLUMN "percentage" DROP NOT NULL;

-- AlterTable
ALTER TABLE "split_results" ADD COLUMN     "fixed_value" DECIMAL(12,2),
ALTER COLUMN "percentage" DROP NOT NULL;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ATTENDANT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'ATTENDANT';

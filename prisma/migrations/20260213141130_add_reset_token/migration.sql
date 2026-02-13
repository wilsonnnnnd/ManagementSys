-- AlterTable
ALTER TABLE "users" ADD COLUMN     "reset_expires_at" TIMESTAMP(6),
ADD COLUMN     "reset_token" TEXT;

-- AlterTable
ALTER TABLE "Recipient" ADD COLUMN "birthday" TEXT,
ADD COLUMN "optOutDigest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "optOutBirthday" BOOLEAN NOT NULL DEFAULT false;

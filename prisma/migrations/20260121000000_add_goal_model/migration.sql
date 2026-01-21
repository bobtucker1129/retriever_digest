-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateTable
CREATE TABLE IF NOT EXISTS "Goal" (
    "id" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "salesRevenue" DECIMAL(12,2) NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "estimatesCreated" INTEGER NOT NULL,
    "newCustomers" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Goal_type_key" ON "Goal"("type");

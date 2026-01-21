-- CreateTable
CREATE TABLE IF NOT EXISTS "DigestData" (
    "id" TEXT NOT NULL,
    "exportDate" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DigestData_exportDate_key" ON "DigestData"("exportDate");

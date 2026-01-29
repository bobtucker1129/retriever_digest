-- CreateTable
CREATE TABLE "Shoutout" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shoutout_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Shoutout" ADD CONSTRAINT "Shoutout_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

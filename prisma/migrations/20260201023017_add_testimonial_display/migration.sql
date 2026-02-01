-- CreateTable
CREATE TABLE "TestimonialDisplay" (
    "id" TEXT NOT NULL,
    "testimonialId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "score" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "numberOfTimesDisplayed" INTEGER NOT NULL DEFAULT 0,
    "lastShownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestimonialDisplay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestimonialDisplay_testimonialId_key" ON "TestimonialDisplay"("testimonialId");

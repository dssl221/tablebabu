CREATE TABLE "SecurityThrottle" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityThrottle_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "SecurityThrottle_expiresAt_idx" ON "SecurityThrottle"("expiresAt");

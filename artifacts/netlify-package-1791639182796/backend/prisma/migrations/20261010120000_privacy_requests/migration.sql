ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT, ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
CREATE TABLE "PrivacyRequest" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "resolution" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacyRequest_type_check" CHECK ("type" IN ('ACCESS','CORRECTION','ERASURE','WITHDRAWAL','NOMINATION','GRIEVANCE')),
  CONSTRAINT "PrivacyRequest_status_check" CHECK ("status" IN ('RECEIVED','IN_REVIEW','RESOLVED'))
);
CREATE INDEX "PrivacyRequest_status_createdAt_idx" ON "PrivacyRequest"("status", "createdAt");

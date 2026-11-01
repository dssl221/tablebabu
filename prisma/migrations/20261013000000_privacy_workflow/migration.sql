ALTER TABLE "PrivacyRequest" ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "verification" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "response" TEXT NOT NULL DEFAULT '';
CREATE TABLE "PrivacyRequestAction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL REFERENCES "PrivacyRequest"("id") ON DELETE CASCADE,
  "actorId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "verification" TEXT NOT NULL,
  "resolution" TEXT NOT NULL,
  "response" TEXT NOT NULL,
  "acknowledged" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PrivacyRequestAction_requestId_createdAt_idx" ON "PrivacyRequestAction"("requestId", "createdAt");

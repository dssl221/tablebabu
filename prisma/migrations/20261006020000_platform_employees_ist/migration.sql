SET TIME ZONE 'UTC';
ALTER TYPE "Role" ADD VALUE 'STAFF';
CREATE TABLE "PlatformRole" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "permissions" TEXT[] NOT NULL, "version" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "employeeVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "platformRoleId" TEXT REFERENCES "PlatformRole"("id") ON DELETE SET NULL ON UPDATE CASCADE, ADD COLUMN "allRestaurants" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "EmployeeRestaurantAccess" ("employeeId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE, "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("employeeId", "restaurantId"));
CREATE INDEX "EmployeeRestaurantAccess_restaurantId_idx" ON "EmployeeRestaurantAccess"("restaurantId");
CREATE TABLE "LoginActivity" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE, "authSessionId" TEXT NOT NULL UNIQUE, "signedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL, "endedAt" TIMESTAMP(3), "endReason" TEXT);
CREATE INDEX "LoginActivity_userId_signedInAt_idx" ON "LoginActivity"("userId", "signedInAt");
CREATE INDEX "LoginActivity_signedInAt_idx" ON "LoginActivity"("signedInAt");
CREATE TABLE "EmployeeAudit" ("id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "subjectId" TEXT NOT NULL, "action" TEXT NOT NULL, "details" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "EmployeeAudit_subjectId_createdAt_idx" ON "EmployeeAudit"("subjectId", "createdAt");
INSERT INTO "PlatformRole" ("id", "name", "permissions", "updatedAt") VALUES
('platform-viewer', 'Viewer', ARRAY['restaurants:view'], CURRENT_TIMESTAMP),
('platform-support', 'Support', ARRAY['restaurants:view','access:manage'], CURRENT_TIMESTAMP),
('platform-billing', 'Billing', ARRAY['restaurants:view','qr:manage','payments:view','payments:record'], CURRENT_TIMESTAMP);
UPDATE "Restaurant" SET "timezone" = 'Asia/Kolkata';
UPDATE "RestaurantOnboarding" SET "draft" = jsonb_set("draft", '{details,timezone}', '"Asia/Kolkata"'::jsonb) WHERE "draft" ? 'details';
-- Future DB connections use UTC; stored historical timestamps are not shifted.
DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC'); END $$;

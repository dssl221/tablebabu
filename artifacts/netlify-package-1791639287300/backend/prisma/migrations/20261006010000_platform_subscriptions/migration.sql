ALTER TABLE "Restaurant"
  ADD COLUMN "platformFrozen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "platformFreezeReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "subscriptionStartsAt" TIMESTAMP(3),
  ADD COLUMN "subscriptionEndsAt" TIMESTAMP(3),
  ADD COLUMN "subscriptionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "subscriptionUpiId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "subscriptionPayee" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "subscriptionAmount" DECIMAL(10,2);
CREATE TABLE "SubscriptionPayment" (
  "id" TEXT NOT NULL PRIMARY KEY, "restaurantId" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL, "reference" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionPayment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SubscriptionPayment_restaurantId_idempotencyKey_key" ON "SubscriptionPayment"("restaurantId", "idempotencyKey");
CREATE INDEX "SubscriptionPayment_restaurantId_createdAt_idx" ON "SubscriptionPayment"("restaurantId", "createdAt");
CREATE TABLE "PlatformAction" (
  "id" TEXT NOT NULL PRIMARY KEY, "restaurantId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL, "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAction_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PlatformAction_restaurantId_createdAt_idx" ON "PlatformAction"("restaurantId", "createdAt");

CREATE UNIQUE INDEX "SubscriptionPayment_restaurantId_reference_key" ON "SubscriptionPayment"("restaurantId", "reference");

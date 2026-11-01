ALTER TABLE "Restaurant" ADD COLUMN "subscriptionQrLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Restaurant" ADD COLUMN "subscriptionQrUploaded" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Restaurant" SET "subscriptionQrLocked" = true WHERE "subscriptionUpiId" <> '';
CREATE TABLE "SubscriptionQrImage" (
  "restaurantId" TEXT PRIMARY KEY REFERENCES "Restaurant"("id") ON DELETE CASCADE,
  "png" BYTEA NOT NULL
);

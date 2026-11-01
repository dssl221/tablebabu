CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'ASSIGNED', 'CONTACTED', 'CLOSED');
CREATE TABLE "HotelEnquiry" (
 "id" TEXT NOT NULL PRIMARY KEY, "ownerName" TEXT NOT NULL, "hotelName" TEXT NOT NULL,
 "email" TEXT NOT NULL, "phone" TEXT NOT NULL, "city" TEXT NOT NULL, "message" TEXT NOT NULL,
 "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW', "assignedToId" TEXT,
 "browserTokenHash" TEXT NOT NULL, "accessExpiresAt" TIMESTAMP(3) NOT NULL,
 "idempotencyKey" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "HotelEnquiry_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HotelEnquiry_browserTokenHash_idempotencyKey_key" ON "HotelEnquiry"("browserTokenHash", "idempotencyKey");
CREATE INDEX "HotelEnquiry_assignedToId_createdAt_idx" ON "HotelEnquiry"("assignedToId", "createdAt");
CREATE INDEX "HotelEnquiry_status_createdAt_idx" ON "HotelEnquiry"("status", "createdAt");
CREATE INDEX "HotelEnquiry_browserTokenHash_accessExpiresAt_idx" ON "HotelEnquiry"("browserTokenHash", "accessExpiresAt");
CREATE TABLE "EnquiryUpdate" (
 "id" TEXT NOT NULL PRIMARY KEY, "enquiryId" TEXT NOT NULL, "actorId" TEXT NOT NULL,
 "assignedToId" TEXT, "status" "EnquiryStatus" NOT NULL, "message" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EnquiryUpdate_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "HotelEnquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EnquiryUpdate_enquiryId_createdAt_idx" ON "EnquiryUpdate"("enquiryId", "createdAt");

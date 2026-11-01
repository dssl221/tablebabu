-- Additive migration: existing restaurants remain live and retain all data.
CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'LIVE');
ALTER TABLE "User" ADD COLUMN "registrationKeyHash" TEXT;
CREATE UNIQUE INDEX "User_registrationKeyHash_key" ON "User"("registrationKeyHash");
ALTER TABLE "Restaurant" ADD COLUMN "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'LIVE';
CREATE TABLE "RestaurantOnboarding" (
    "restaurantId" TEXT NOT NULL,
    "draft" JSONB NOT NULL DEFAULT '{}',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RestaurantOnboarding_pkey" PRIMARY KEY ("restaurantId")
);
ALTER TABLE "RestaurantOnboarding" ADD CONSTRAINT "RestaurantOnboarding_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

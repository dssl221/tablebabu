CREATE SEQUENCE restaurant_code_seq;
ALTER TABLE "Restaurant" ADD COLUMN "orderCode" TEXT NOT NULL DEFAULT ('H' || upper(to_hex(nextval('restaurant_code_seq'))));
CREATE UNIQUE INDEX "Restaurant_orderCode_key" ON "Restaurant"("orderCode");
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_orderCode_format" CHECK ("orderCode" ~ '^[A-Z][A-Z0-9]{1,15}$');
CREATE FUNCTION immutable_restaurant_order_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."orderCode" IS DISTINCT FROM OLD."orderCode" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Restaurant order code is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER restaurant_order_code_immutable BEFORE UPDATE OF "orderCode" ON "Restaurant" FOR EACH ROW EXECUTE FUNCTION immutable_restaurant_order_code();

CREATE TABLE "RestaurantOrderCounter" (
  "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id") ON DELETE CASCADE,
  "year" INTEGER NOT NULL,
  "currentCounter" INTEGER NOT NULL CHECK ("currentCounter" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("restaurantId", "year")
);
ALTER TABLE "Order" ADD COLUMN "legacyOrderNumber" INTEGER;
UPDATE "Order" SET "legacyOrderNumber" = "orderNumber";
DROP INDEX "Order_restaurantId_orderNumber_key";
ALTER TABLE "Order" ALTER COLUMN "orderNumber" TYPE TEXT USING "orderNumber"::text;
ALTER TABLE "Order" ADD COLUMN "orderYear" INTEGER;
ALTER TABLE "Order" ADD COLUMN "orderCounter" INTEGER;
UPDATE "Order" o SET "orderYear" = EXTRACT(YEAR FROM (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::integer,
  "orderCounter" = o."legacyOrderNumber";
UPDATE "Order" o SET "orderNumber" = r."orderCode" || ':' || o."orderYear" || ':' || lpad(o."orderCounter"::text, greatest(6,length(o."orderCounter"::text)), '0')
FROM "Restaurant" r WHERE r.id = o."restaurantId";
ALTER TABLE "Order" ALTER COLUMN "orderYear" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "orderCounter" SET NOT NULL;
ALTER TABLE "Order" ADD CONSTRAINT "Order_counter_positive" CHECK ("orderCounter" > 0);
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_restaurantId_orderYear_orderCounter_key" ON "Order"("restaurantId", "orderYear", "orderCounter");
-- Historical high-water marks only: never used to allocate new orders.
INSERT INTO "RestaurantOrderCounter" ("restaurantId", "year", "currentCounter")
SELECT "restaurantId", "orderYear", max("orderCounter") FROM "Order" GROUP BY "restaurantId", "orderYear";
ALTER TABLE "Restaurant" DROP COLUMN "nextOrderNumber";

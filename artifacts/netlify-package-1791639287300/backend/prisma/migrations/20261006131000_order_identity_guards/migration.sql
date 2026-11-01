CREATE FUNCTION enforce_order_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE code TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."orderNumber" IS DISTINCT FROM OLD."orderNumber"
      OR NEW."restaurantId" IS DISTINCT FROM OLD."restaurantId"
      OR NEW."orderYear" IS DISTINCT FROM OLD."orderYear"
      OR NEW."orderCounter" IS DISTINCT FROM OLD."orderCounter" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Order identity is immutable';
    END IF;
  ELSE
    SELECT "orderCode" INTO STRICT code FROM "Restaurant" WHERE id=NEW."restaurantId";
    IF NEW."orderNumber" <> code || ':' || NEW."orderYear" || ':' || lpad(NEW."orderCounter"::text, greatest(6,length(NEW."orderCounter"::text)), '0') THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invalid order identity';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_identity_guard BEFORE INSERT OR UPDATE OF "orderNumber", "restaurantId", "orderYear", "orderCounter" ON "Order" FOR EACH ROW EXECUTE FUNCTION enforce_order_identity();

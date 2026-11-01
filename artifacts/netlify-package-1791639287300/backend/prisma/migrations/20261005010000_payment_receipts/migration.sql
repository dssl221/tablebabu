ALTER TABLE "OrderSession" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "OrderSession" ADD COLUMN "receiptHtml" TEXT;
ALTER TABLE "OrderSession" ADD CONSTRAINT "OrderSession_paymentMethod_check" CHECK ("paymentMethod" IS NULL OR "paymentMethod" IN ('UPI', 'CASH'));

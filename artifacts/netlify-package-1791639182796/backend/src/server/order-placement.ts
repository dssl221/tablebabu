import { Prisma, type OrderSession, type Restaurant } from "@prisma/client";
import { performance } from "node:perf_hooks";
import { db } from "./db";
import { assert, HttpError } from "./security";
import { isOpen } from "./domain";
import { istDateKey } from "../lib/time";
import { trackTransactionStart } from "./transaction-load";

export const orderYear = (now = new Date()) =>
  Number(istDateKey(now).slice(0, 4));
export function formatOrderNumber(code: string, year: number, counter: number) {
  if (
    !/^[A-Z][A-Z0-9]{1,15}$/.test(code) ||
    !Number.isSafeInteger(counter) ||
    counter < 1
  )
    throw new Error("Invalid order identity");
  return `${code}:${year}:${String(counter).padStart(6, "0")}`;
}
export async function allocateOrderCounter(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  year: number,
) {
  const [row] = await tx.$queryRaw<{ currentCounter: number }[]>`
    INSERT INTO "RestaurantOrderCounter" ("restaurantId", "year", "currentCounter", "createdAt", "updatedAt")
    VALUES (${restaurantId}, ${year}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("restaurantId", "year") DO UPDATE
    SET "currentCounter" = "RestaurantOrderCounter"."currentCounter" + 1, "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "currentCounter"`;
  return row.currentCounter;
}
import { databaseFailure } from "./database-errors";
export { databaseFailure } from "./database-errors";
type Input = {
  restaurantSlug: string;
  idempotencyKey: string;
  customerNote?: string;
  items: { menuItemId: string; quantity: number; notes: string }[];
};
const include = {
  items: true,
  orderSession: { select: { id: true, customerName: true, status: true } },
};
export async function placeOrder(
  input: Input,
  session: OrderSession,
  requestHash: string,
  requestId: string,
) {
  for (let attempt = 0; ; attempt++) {
    const load = trackTransactionStart();
    const started = performance.now();
    const timings: Record<string, number> = {};
    let stage = "acquisition",
      callbackEnd = started;
    const measure = async <T>(name: string, work: () => Promise<T>) => {
      stage = name;
      const start = performance.now();
      try {
        return await work();
      } finally {
        timings[name] = performance.now() - start;
      }
    };
    try {
      const result = await db.$transaction(
        async (tx) => {
          load.acquired();
          timings.acquisition = performance.now() - started;
          // Session lock serializes duplicate submissions and settlement. Touching
          // its version timestamp also forces older SERIALIZABLE billing snapshots
          // to abort/retry rather than settle a bill missing this order.
          const [fresh] = await measure(
            "session-lock",
            () =>
              tx.$queryRaw<
                OrderSession[]
              >`SELECT * FROM "OrderSession" WHERE "id"=${session.id} AND "restaurantId"=${session.restaurantId} FOR UPDATE`,
          );
          assert(fresh, 401, "Your session has expired. Please start again.");
          const previous = await tx.order.findUnique({
            where: {
              orderSessionId_idempotencyKey: {
                orderSessionId: session.id,
                idempotencyKey: input.idempotencyKey,
              },
            },
            include,
          });
          if (previous) {
            assert(
              previous.requestHash === requestHash,
              409,
              "This submission key was already used for another order.",
            );
            callbackEnd = performance.now();
            stage = "commit";
            return { order: previous, created: false };
          }
          assert(
            fresh.status === "ACTIVE" &&
              !fresh.paidAt &&
              fresh.expiresAt > new Date(),
            409,
            "Ordering has ended for this visit. Please ask at the counter.",
          );
          const [restaurant] = await measure(
            "restaurant-validation",
            () =>
              tx.$queryRaw<
                Restaurant[]
              >`SELECT * FROM "Restaurant" WHERE "id"=${session.restaurantId} FOR SHARE`,
          );
          assert(
            restaurant && isOpen(restaurant),
            409,
            "The restaurant is currently not accepting orders.",
          );
          const ids = input.items.map((i) => i.menuItemId).sort();
          // Shared locks keep category activation, item price and availability
          // authoritative until commit; other orders can read them concurrently.
          const items = await measure("pricing-lookup", async () => {
            await tx.$queryRaw`SELECT id FROM "MenuItem" WHERE "restaurantId"=${restaurant.id} AND id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`;
            await tx.$queryRaw`SELECT c.id FROM "MenuCategory" c WHERE c."restaurantId"=${restaurant.id} AND c.id IN (SELECT "categoryId" FROM "MenuItem" WHERE id IN (${Prisma.join(ids)})) ORDER BY c.id FOR SHARE`;
            return tx.menuItem.findMany({
              where: {
                id: { in: ids },
                restaurantId: restaurant.id,
                isAvailable: true,
                category: { isActive: true },
              },
              include: { category: true },
            });
          });
          assert(
            items.length === input.items.length,
            409,
            "An item is sold out or no longer on the menu. Please review your cart.",
          );
          const snapshots = input.items.map((i) => {
            const item = items.find((m) => m.id === i.menuItemId)!;
            return {
              menuItemId: item.id,
              itemNameSnapshot: item.name,
              categoryNameSnapshot: item.category.name,
              priceSnapshot: item.price,
              quantity: i.quantity,
              notes: i.notes,
              total: item.price.mul(i.quantity),
            };
          });
          await tx.orderSession.update({
            where: { id: session.id },
            data: { updatedAt: new Date() },
          });
          // Use one backend instant for both the visible business year and the
          // order timestamp, including transactions crossing IST midnight.
          const createdAt = new Date();
          const year = orderYear(createdAt);
          const counter = await measure("counter-allocation", () =>
            allocateOrderCounter(tx, restaurant.id, year),
          );
          const order = await measure("order-insertion", () =>
            tx.order.create({
              data: {
                restaurantId: restaurant.id,
                createdAt,
                orderSessionId: session.id,
                orderYear: year,
                orderCounter: counter,
                orderNumber: formatOrderNumber(
                  restaurant.orderCode,
                  year,
                  counter,
                ),
                subtotal: snapshots.reduce(
                  (sum, i) => sum.add(i.total),
                  new Prisma.Decimal(0),
                ),
                customerNote: input.customerNote,
                idempotencyKey: input.idempotencyKey,
                requestHash,
              },
            }),
          );
          const createdItems = await measure("item-insertion", () =>
            tx.orderItem.createManyAndReturn({
              data: snapshots.map((i) => ({ ...i, orderId: order.id })),
            }),
          );
          const complete = {
            ...order,
            items: createdItems,
            orderSession: {
              id: fresh.id,
              customerName: fresh.customerName,
              status: fresh.status,
            },
          };
          callbackEnd = performance.now();
          stage = "commit";
          return { order: complete, created: true };
        },
        { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 },
      );
      timings.commitRoundTrip = performance.now() - callbackEnd;
      load.finish();
      if (process.env.ORDER_DIAGNOSTICS === "1")
        process.stdout.write(
          JSON.stringify({
            event: "order.transaction",
            requestId,
            restaurantId: session.restaurantId,
            attempt,
            elapsedMs: performance.now() - started,
            timings,
          }) + "\n",
        );
      return result;
    } catch (error) {
      load.finish();
      const failure = databaseFailure(error);
      if (!(error instanceof HttpError))
        process.stdout.write(
          JSON.stringify({
            event: "order.transaction.failure",
            requestId,
            restaurantId: session.restaurantId,
            stage,
            attempt,
            elapsedMs: performance.now() - started,
            timings,
            ...failure,
          }) + "\n",
        );
      if (failure.retryable && attempt < 2) {
        await new Promise((r) =>
          setTimeout(r, 20 * (attempt + 1) + Math.random() * 30),
        );
        continue;
      }
      if (failure.retryable || failure.unavailable)
        throw new HttpError(
          503,
          "Order is taking longer than expected. Please retry.",
        );
      throw error;
    }
  }
}

import { type Prisma } from "@prisma/client";
import { db } from "./db";
import { databaseFailure } from "./order-placement";
import { HttpError, assert } from "./security";

// The same session lock is taken by order creation. Bill/help creation is
// serialized only within a visit, including the pending-request lookup.
export async function sessionTransaction<T>(
  restaurantId: string,
  sessionId: string,
  requestId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; ; attempt++) {
    const started = performance.now();
    try {
      return await db.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM "OrderSession" WHERE id=${sessionId} AND "restaurantId"=${restaurantId} FOR UPDATE`;
          assert(rows.length, 404, "Session not found.");
          return work(tx);
        },
        { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 },
      );
    } catch (error) {
      const failure = databaseFailure(error);
      if (!(error instanceof HttpError))
        process.stdout.write(
          JSON.stringify({
            event: "session.transaction.failure",
            restaurantId,
            requestId,
            attempt,
            elapsedMs: performance.now() - started,
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
          "Your request is taking longer than expected. Please retry.",
        );
      throw error;
    }
  }
}

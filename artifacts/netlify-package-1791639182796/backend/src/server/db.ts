import { PrismaClient, Prisma } from "@prisma/client";
import { databaseFailure } from "./database-errors";
export const db = new PrismaClient({ log: [{ level: "info", emit: "event" }] });
db.$on("info", (event) => {
  const pool = event.message.match(/pool with (\d+) connections/);
  if (pool && process.env.ORDER_DIAGNOSTICS === "1")
    process.stdout.write(
      JSON.stringify({
        event: "database.pool",
        maxConnections: Number(pool[1]),
      }) + "\n",
    );
});
export async function transaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (e) {
      if (process.env.ORDER_DIAGNOSTICS === "1")
        process.stdout.write(
          JSON.stringify({
            event: "database.transaction.failure",
            attempt,
            ...databaseFailure(e),
          }) + "\n",
        );
      if (
        (databaseFailure(e).retryable ||
          (e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002")) &&
        attempt < 8
      ) {
        await new Promise((r) =>
          setTimeout(r, Math.min(500, 25 * 2 ** attempt) + Math.random() * 50),
        );
        continue;
      }
      throw e;
    }
  }
}

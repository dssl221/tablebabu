import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile } from "node:fs/promises";
import { removeStressThrottles } from "./stress-cleanup";

// Explicit recovery for an interrupted local run, never automatic startup work.
if (process.env.CONFIRM_STOPPED_STRESS_RUN !== "1")
  throw new Error("Stop the load test and explicitly confirm recovery first.");
const url = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Fixture recovery is restricted to the local database.");
const db = new PrismaClient();
try {
  const context = JSON.parse(
    await readFile("artifacts/stress-database-context.json", "utf8"),
  );
  const ids = context.restaurants.map((r: { id: string }) => r.id);
  const restaurants = await db.restaurant.findMany({
    where: { id: { in: ids } },
    include: { owner: true },
  });
  for (const r of restaurants) {
    const saved = context.restaurants.find(
      (entry: { id: string }) => entry.id === r.id,
    );
    if (
      saved.slug !== r.slug ||
      saved.orderCode !== r.orderCode ||
      !r.slug.startsWith("platform-stress-") ||
      !r.owner.email.startsWith("platform-stress-") ||
      !r.owner.email.endsWith("@example.test")
    )
      throw new Error(
        "Fixture identity does not match the saved stress manifest.",
      );
    if (
      await db.restaurant.count({
        where: { ownerId: r.ownerId, id: { notIn: ids } },
      })
    )
      throw new Error("Fixture owner has a restaurant outside the manifest.");
  }
  const orders = await db.order.count({ where: { restaurantId: { in: ids } } });
  await removeStressThrottles(db, ids);
  await db.$transaction(
    async (tx) => {
      const where = { restaurantId: { in: ids } };
      await tx.serviceRequest.deleteMany({ where });
      await tx.order.deleteMany({ where });
      await tx.orderSession.deleteMany({ where });
      await tx.menuItem.deleteMany({ where });
      await tx.menuCategory.deleteMany({ where });
      await tx.restaurant.deleteMany({ where: { id: { in: ids } } });
      await tx.user.deleteMany({
        where: { id: { in: restaurants.map((r) => r.ownerId) } },
      });
    },
    { timeout: 30000 },
  );
  const result = {
    recoveredAt: new Date(),
    interruptedRun: true,
    restaurantsRemoved: restaurants.length,
    ordersRemoved: orders,
  };
  await writeFile(
    "artifacts/interrupted-stress-cleanup.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await db.$disconnect();
}

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile } from "node:fs/promises";
const db = new PrismaClient();
try {
  const context = JSON.parse(
    await readFile("artifacts/stress-database-context.json", "utf8"),
  );
  const ids = context.restaurants.map((r: { id: string }) => r.id);
  const remaining = await db.restaurant.count({ where: { id: { in: ids } } });
  if (remaining)
    throw new Error(
      "Stress fixtures still exist; wait for the load test to finish. No quotas were reset.",
    );
  const keys = context.throttleKeys as string[];
  if (
    !Array.isArray(keys) ||
    keys.some(
      (k) =>
        !/^(order-session|service-session|session-create):[a-f0-9]{64}$/.test(
          k,
        ),
    )
  )
    throw new Error("Invalid fixture throttle manifest");
  const removed = await db.securityThrottle.deleteMany({
    where: { key: { in: keys } },
  });
  const fixtureRestaurants = await db.restaurant.count({
    where: {
      OR: [
        { slug: { startsWith: "stress-" } },
        { slug: { startsWith: "platform-stress-" } },
      ],
    },
  });
  const fixtureOwners = await db.user.count({
    where: {
      AND: [
        { email: { endsWith: "@example.test" } },
        {
          OR: [
            { email: { startsWith: "stress-" } },
            { email: { startsWith: "platform-stress-" } },
          ],
        },
      ],
    },
  });
  const counterRows = await db.restaurantOrderCounter.count({
    where: { restaurantId: { in: ids } },
  });
  const idle =
    await db.$queryRaw`SELECT count(*)::int AS "idleInTransaction" FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'`;
  const result = {
    verifiedAt: new Date(),
    fixtureRestaurants,
    fixtureOwners,
    counterRows,
    fixtureThrottleRowsRemoved: removed.count,
    remainingManifestThrottleRows: await db.securityThrottle.count({
      where: { key: { in: keys } },
    }),
    connections: idle,
  };
  await writeFile(
    "artifacts/stress-cleanup-verification.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  if (fixtureRestaurants || fixtureOwners || counterRows) process.exitCode = 1;
} finally {
  await db.$disconnect();
}

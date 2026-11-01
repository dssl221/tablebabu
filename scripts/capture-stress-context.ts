import "dotenv/config";
import { stressThrottleKeys } from "./stress-cleanup";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
const db = new PrismaClient();
try {
  const restaurants = await db.restaurant.findMany({
    where: { slug: { startsWith: "platform-stress-" } },
    select: { id: true, slug: true, orderCode: true },
  });
  const throttleKeys = await stressThrottleKeys(
    db,
    restaurants.map((r) => r.id),
  );
  const settings =
    await db.$queryRaw`SELECT name, setting FROM pg_settings WHERE name IN ('max_connections','shared_buffers','statement_timeout','lock_timeout','TimeZone')`;
  await writeFile(
    "artifacts/stress-database-context.json",
    JSON.stringify(
      { capturedAt: new Date(), restaurants, settings, throttleKeys },
      null,
      2,
    ),
  );
  console.log(
    `Captured ${restaurants.length} test restaurant IDs and non-secret database settings.`,
  );
} finally {
  await db.$disconnect();
}

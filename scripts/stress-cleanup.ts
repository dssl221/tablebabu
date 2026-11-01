import type { PrismaClient } from "@prisma/client";
import { ipKeyGenerator } from "express-rate-limit";
import { hash } from "../src/server/security";

// Called only after a test workload finishes. Never resets a real restaurant's
// quota or the process-wide IP envelopes.
export async function stressThrottleKeys(
  db: PrismaClient,
  restaurantIds: string[],
) {
  const restaurants = await db.restaurant.findMany({
    where: { id: { in: restaurantIds } },
    select: { slug: true, sessions: { select: { id: true } } },
  });
  const keys: string[] = [];
  for (const r of restaurants) {
    for (const s of r.sessions) {
      keys.push(
        `order-session:${hash(s.id)}`,
        `service-session:${hash(s.id)}`,
        `session-create:${hash(`guest:${s.id}:${r.slug}`)}`,
      );
    }
    for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1"])
      keys.push(`session-create:${hash(`${ipKeyGenerator(ip)}:${r.slug}`)}`);
  }
  return [...new Set(keys)];
}
export async function removeStressThrottles(
  db: PrismaClient,
  restaurantIds: string[],
) {
  const keys = await stressThrottleKeys(db, restaurantIds);
  await db.securityThrottle.deleteMany({ where: { key: { in: keys } } });
}

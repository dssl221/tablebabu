import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID, createHash } from "node:crypto";
const db = new PrismaClient();
test("visit export requires the matching unexpired guest cookie and excludes credentials", async ({
  request,
}) => {
  const suffix = randomUUID();
  const user = await db.user.create({
    data: {
      name: "Export test",
      email: `export-${suffix}@example.test`,
      passwordHash: "unused-test",
    },
  });
  try {
    const restaurant = await db.restaurant.create({
      data: {
        ownerId: user.id,
        name: "Export Bistro",
        slug: `export-${suffix}`,
      },
    });
    const raw = randomBytes(32).toString("base64url");
    const session = await db.orderSession.create({
      data: {
        restaurantId: restaurant.id,
        customerName: "Guest",
        sessionToken: createHash("sha256").update(raw).digest("hex"),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const url = `/api/public/sessions/current/export?slug=${restaurant.slug}`;
    expect((await request.get(url)).status()).toBe(401);
    const headers = { Cookie: `guest-${restaurant.slug}=${raw}` };
    const response = await request.get(url, { headers });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const text = await response.text();
    expect(text).toContain('"customerName":"Guest"');
    expect(text).not.toContain(raw);
    expect(text).not.toContain(session.sessionToken);
    expect(text).not.toContain("receiptHtml");
    expect(text).not.toContain(user.id);
    expect((await request.get(`${url}-other`, { headers })).status()).toBe(401);
    await db.orderSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(0) },
    });
    expect((await request.get(url, { headers })).status()).toBe(401);
  } finally {
    const restaurants = await db.restaurant.findMany({
      where: { ownerId: user.id },
      select: { id: true },
    });
    await db.orderSession.deleteMany({
      where: { restaurantId: { in: restaurants.map((r) => r.id) } },
    });
    await db.restaurant.deleteMany({ where: { ownerId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});

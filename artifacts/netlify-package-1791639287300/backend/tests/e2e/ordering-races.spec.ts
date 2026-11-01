import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import {
  hash,
  token,
  adminCookie,
  sessionCookie,
} from "../../src/server/security";
const db = new PrismaClient();
let ownerId = "",
  restaurantId = "";
let socket: Socket | undefined;
test.afterAll(async () => {
  socket?.disconnect();
  if (restaurantId) {
    const where = { restaurantId };
    await db.serviceRequest.deleteMany({ where });
    await db.order.deleteMany({ where });
    await db.orderSession.deleteMany({ where });
    await db.menuItem.deleteMany({ where });
    await db.menuCategory.deleteMany({ where });
    await db.restaurant.delete({ where: { id: restaurantId } });
  }
  if (ownerId) await db.user.delete({ where: { id: ownerId } });
  await db.$disconnect();
});
test("order versus settlement preserves totals; insertion failure rolls back counter and emits nothing", async ({
  request,
}) => {
  const suffix = randomUUID(),
    origin = process.env.APP_ORIGIN || "http://localhost:3000";
  ownerId = (
    await db.user.create({
      data: {
        name: "Race fixture",
        email: `race-${suffix}@example.test`,
        passwordHash: "disabled",
      },
    })
  ).id;
  const restaurant = await db.restaurant.create({
    data: {
      ownerId,
      name: "Race fixture",
      slug: `race-${suffix}`,
      openingTime: "00:00",
      closingTime: "00:00",
    },
  });
  restaurantId = restaurant.id;
  const category = await db.menuCategory.create({
    data: { restaurantId, name: "Food" },
  });
  const item = await db.menuItem.create({
    data: { restaurantId, categoryId: category.id, name: "Rice", price: 125 },
  });
  const ownerToken = token();
  await db.authSession.create({
    data: {
      userId: ownerId,
      tokenHash: hash(ownerToken),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const ownerHeaders = {
    Origin: origin,
    Cookie: `${adminCookie}=${ownerToken}`,
  };
  socket = io(origin, {
    transports: ["websocket"],
    auth: { role: "admin" },
    extraHeaders: ownerHeaders,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    socket!.once("connect", resolve);
    socket!.once("connect_error", reject);
  });
  let eventCount = 0;
  socket.on("order:new", () => eventCount++);
  let committed = 0;
  for (let i = 0; i < 10; i++) {
    const raw = token();
    const session = await db.orderSession.create({
      data: {
        restaurantId,
        customerName: "Race Guest",
        sessionToken: hash(raw),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const headers = {
      Origin: origin,
      Cookie: `${sessionCookie(restaurant.slug)}=${raw}`,
    };
    const data = () => ({
      restaurantSlug: restaurant.slug,
      idempotencyKey: randomUUID(),
      items: [{ menuItemId: item.id, quantity: 2 }],
    });
    const first = await request.post("/api/public/orders", {
      headers,
      data: data(),
    });
    expect(first.status()).toBe(201);
    committed++;
    await db.order.update({
      where: { id: (await first.json()).id },
      data: { status: "COMPLETED" },
    });
    const [paid, order] = await Promise.all([
      request.post(`/api/sessions/${session.id}/paid`, {
        headers: ownerHeaders,
      }),
      request.post("/api/public/orders", { headers, data: data() }),
    ]);
    expect([200, 409]).toContain(paid.status());
    expect([201, 409]).toContain(order.status());
    expect(paid.status() === 200 && order.status() === 201).toBe(false);
    if (order.status() === 201) committed++;
    const current = await db.orderSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { orders: true },
    });
    if (current.paidAt) {
      expect(current.orders).toHaveLength(1);
      expect(current.orders.every((o) => o.status === "COMPLETED")).toBe(true);
    }
  }
  await expect.poll(() => eventCount).toBe(committed);
  // Deliberately invalid database fixture: this price is outside the admin API
  // range, and quantity two overflows the order Decimal(10,2) at INSERT.
  await db.menuItem.update({
    where: { id: item.id },
    data: { price: "99999999.99" },
  });
  const raw = token();
  await db.orderSession.create({
    data: {
      restaurantId,
      customerName: "Rollback Guest",
      sessionToken: hash(raw),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const before = await db.restaurantOrderCounter.findMany({
    where: { restaurantId },
  });
  const failure = await request.post("/api/public/orders", {
    headers: {
      Origin: origin,
      Cookie: `${sessionCookie(restaurant.slug)}=${raw}`,
    },
    data: {
      restaurantSlug: restaurant.slug,
      idempotencyKey: randomUUID(),
      items: [{ menuItemId: item.id, quantity: 2 }],
    },
  });
  expect(failure.status()).toBe(500);
  expect(await failure.json()).toEqual({
    error: "Something went wrong. Please retry.",
  });
  expect(
    await db.restaurantOrderCounter.findMany({ where: { restaurantId } }),
  ).toEqual(before);
  expect(await db.order.count({ where: { restaurantId } })).toBe(committed);
  expect(eventCount).toBe(committed);
});

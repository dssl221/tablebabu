import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import {
  allocateOrderCounter,
  formatOrderNumber,
  orderYear,
} from "../../src/server/order-placement";
import { token, hash, sessionCookie } from "../../src/server/security";
const db = new PrismaClient(),
  suffix = randomUUID().slice(0, 8);
let ownerId = "";
let socket: Socket | undefined;
const ids: string[] = [];
test.afterAll(async () => {
  socket?.disconnect();
  const where = { restaurantId: { in: ids } };
  await db.serviceRequest.deleteMany({ where });
  await db.order.deleteMany({ where });
  await db.orderSession.deleteMany({ where });
  await db.menuItem.deleteMany({ where });
  await db.menuCategory.deleteMany({ where });
  await db.restaurant.deleteMany({ where: { id: { in: ids } } });
  if (ownerId) await db.user.delete({ where: { id: ownerId } });
  await db.$disconnect();
});
test("independent yearly counters, immutable hotel code, concurrent duplicates and rollback", async ({
  request,
}) => {
  ownerId = (
    await db.user.create({
      data: {
        name: "Number test",
        email: `number-${suffix}@example.test`,
        passwordHash: "disabled",
      },
    })
  ).id;
  const hotels = await Promise.all(
    ["AMAN", "HILDA"].map((code) =>
      db.restaurant.create({
        data: {
          ownerId,
          name: code,
          slug: `${code.toLowerCase()}-${suffix}`,
          orderCode: `${code}${suffix.toUpperCase()}`,
          openingTime: "00:00",
          closingTime: "00:00",
        },
      }),
    ),
  );
  ids.push(...hotels.map((h) => h.id));
  const a = hotels[0],
    b = hotels[1];
  const values = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      db.$transaction(
        (tx) => allocateOrderCounter(tx, i % 2 ? a.id : b.id, 2026),
        { maxWait: 10000, timeout: 15000 },
      ),
    ),
  );
  expect(values.filter((_, i) => i % 2).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 25 }, (_, i) => i + 1),
  );
  expect(values.filter((_, i) => !(i % 2)).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 25 }, (_, i) => i + 1),
  );
  await db.restaurantOrderCounter.update({
    where: { restaurantId_year: { restaurantId: a.id, year: 2026 } },
    data: { currentCounter: 4827 },
  });
  expect(
    await db.$transaction((tx) => allocateOrderCounter(tx, a.id, 2027)),
  ).toBe(1);
  expect(formatOrderNumber(a.orderCode, 2027, 1)).toBe(
    `${a.orderCode}:2027:000001`,
  );
  await expect(
    db.$transaction(async (tx) => {
      await allocateOrderCounter(tx, b.id, 2028);
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(
    await db.restaurantOrderCounter.findUnique({
      where: { restaurantId_year: { restaurantId: b.id, year: 2028 } },
    }),
  ).toBeNull();
  await db.restaurant.update({
    where: { id: a.id },
    data: { name: "Renamed hotel" },
  });
  expect(
    (await db.restaurant.findUniqueOrThrow({ where: { id: a.id } })).orderCode,
  ).toBe(a.orderCode);
  await expect(
    db.restaurant.update({
      where: { id: a.id },
      data: { orderCode: "CHANGED" },
    }),
  ).rejects.toThrow();
  await expect(
    db.restaurant.create({
      data: {
        ownerId,
        name: "Duplicate",
        slug: `duplicate-${suffix}`,
        orderCode: a.orderCode,
      },
    }),
  ).rejects.toThrow();
  const category = await db.menuCategory.create({
    data: { restaurantId: a.id, name: "Food" },
  });
  const item = await db.menuItem.create({
    data: {
      restaurantId: a.id,
      categoryId: category.id,
      name: "Rice",
      price: 125,
    },
  });
  const raw = token(),
    session = await db.orderSession.create({
      data: {
        restaurantId: a.id,
        customerName: "Rahul",
        sessionToken: hash(raw),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  const headers = {
    Origin: process.env.APP_ORIGIN || "http://localhost:3000",
    Cookie: `${sessionCookie(a.slug)}=${raw}`,
  };
  socket = io(headers.Origin, {
    transports: ["websocket"],
    auth: { slug: a.slug },
    extraHeaders: headers,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    socket!.once("connect", resolve);
    socket!.once("connect_error", reject);
  });
  let newOrderEvents = 0;
  socket.on("order:new", () => {
    newOrderEvents++;
  });
  const data = {
    restaurantSlug: a.slug,
    idempotencyKey: randomUUID(),
    year: 1999,
    subtotal: 0.01,
    items: [{ menuItemId: item.id, quantity: 2, price: 0.01 }],
  };
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      request.post("/api/public/orders", { headers, data }),
    ),
  );
  expect(responses.filter((r) => r.status() === 201)).toHaveLength(1);
  expect(responses.filter((r) => r.status() === 200)).toHaveLength(9);
  const orders = await db.order.findMany({
    where: { orderSessionId: session.id },
  });
  expect(orders).toHaveLength(1);
  await expect.poll(() => newOrderEvents).toBe(1);
  expect(Number(orders[0].subtotal)).toBe(250);
  expect(orders[0].orderYear).toBe(orderYear());
  expect(orderYear(orders[0].createdAt)).toBe(orders[0].orderYear);
  const counter = await db.restaurantOrderCounter.findUniqueOrThrow({
    where: { restaurantId_year: { restaurantId: a.id, year: orderYear() } },
  });
  expect(counter.currentCounter).toBe(orders[0].orderCounter);
  expect(
    (
      await request.post("/api/public/orders", {
        headers,
        data: { ...data, items: [{ menuItemId: item.id, quantity: 1 }] },
      })
    ).status(),
  ).toBe(409);
  await db.menuItem.update({
    where: { id: item.id },
    data: { isAvailable: false },
  });
  expect(
    (
      await request.post("/api/public/orders", {
        headers,
        data: { ...data, idempotencyKey: randomUUID() },
      })
    ).status(),
  ).toBe(409);
  expect(await db.order.count({ where: { orderSessionId: session.id } })).toBe(
    1,
  );
  await expect(
    db.order.update({
      where: { id: orders[0].id },
      data: { orderNumber: "BROKEN:2026:000001" },
    }),
  ).rejects.toThrow();
  const bills = await Promise.all(
    Array.from({ length: 10 }, () =>
      request.post("/api/public/service-requests", {
        headers,
        data: {
          restaurantSlug: a.slug,
          type: "REQUEST_BILL",
          paymentMethod: "UPI",
        },
      }),
    ),
  );
  expect(bills.every((r) => r.status() === 200)).toBe(true);
  expect(
    await db.serviceRequest.count({
      where: { orderSessionId: session.id, type: "REQUEST_BILL" },
    }),
  ).toBe(1);
  expect(
    (
      await request.post("/api/public/service-requests", {
        headers,
        data: { restaurantSlug: a.slug, type: "NEED_HELP" },
      })
    ).status(),
  ).toBe(429);
  expect(
    (
      await request.post("/api/public/orders", {
        headers,
        data: { ...data, idempotencyKey: randomUUID() },
      })
    ).status(),
  ).toBe(409);
  expect(newOrderEvents).toBe(1);
});

import "dotenv/config";
import { removeStressThrottles } from "./stress-cleanup";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { io, type Socket } from "socket.io-client";
import {
  hash,
  token,
  sessionCookie,
  adminCookie,
} from "../src/server/security";

// Local-only, isolated fixtures. Never disables application security controls.
const base = process.env.STRESS_ORIGIN || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local targets only");
const origin = process.env.APP_ORIGIN || base;
const db = new PrismaClient();
const slug = `platform-stress-${randomUUID().slice(0, 8)}`;
const results: any[] = [],
  sockets: Socket[] = [];
const ownerIds: string[] = [],
  restaurantIds: string[] = [];
const checks: Record<string, boolean> = {};
let persistedOrders = 0,
  realtimeEvents = 0;
async function request(path: string, cookie = "", body?: unknown) {
  const start = performance.now();
  try {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { status: response.status, ms: performance.now() - start, data };
  } catch {
    return { status: 0, ms: performance.now() - start, data: null };
  }
}
async function phase(
  name: string,
  count: number,
  concurrency: number,
  task: (i: number) => ReturnType<typeof request>,
) {
  let next = 0;
  const samples: Awaited<ReturnType<typeof request>>[] = [];
  const start = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < count) {
        const index = next++;
        samples.push(await task(index));
      }
    }),
  );
  const elapsed = performance.now() - start;
  const times = samples.map((s) => s.ms).sort((a, b) => a - b);
  const statuses: Record<string, number> = {};
  for (const s of samples) statuses[s.status] = (statuses[s.status] || 0) + 1;
  const result = {
    name,
    requests: count,
    concurrency,
    seconds: +(elapsed / 1000).toFixed(2),
    requestsPerSecond: +((count * 1000) / elapsed).toFixed(1),
    p50Ms: +times[Math.ceil(count * 0.5) - 1].toFixed(1),
    p95Ms: +times[Math.ceil(count * 0.95) - 1].toFixed(1),
    p99Ms: +times[Math.ceil(count * 0.99) - 1].toFixed(1),
    statuses,
  };
  results.push(result);
  console.log(JSON.stringify(result));
  return samples;
}
async function connect(cookie: string, auth: object) {
  const socket = io(base, {
    transports: ["websocket"],
    extraHeaders: { Origin: origin, Cookie: cookie },
    auth,
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket timeout")), 10000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
  return socket;
}

const hotels: {
  id: string;
  slug: string;
  code: string;
  itemId: string;
  cookies: string[];
}[] = [];
const events = new Set<string>();
let wrongRoom = false,
  duplicateEvents = 0;
const startedAt = new Date();
try {
  if ((await request("/api/health")).status !== 200)
    throw new Error("Server unavailable");
  for (let hotel = 0; hotel < 100; hotel++) {
    const owner = await db.user.create({
      data: {
        name: "Platform stress fixture",
        email: `${slug}-${hotel}@example.test`,
        passwordHash: "disabled-test-login",
      },
    });
    ownerIds.push(owner.id);
    const r = await db.restaurant.create({
      data: {
        ownerId: owner.id,
        slug: `${slug}-${hotel}`,
        name: `Stress hotel ${hotel}`,
        openingTime: "00:00",
        closingTime: "00:00",
      },
    });
    restaurantIds.push(r.id);
    const categories = await Promise.all(
      ["Meals", "Desserts"].map((name) =>
        db.menuCategory.create({ data: { restaurantId: r.id, name } }),
      ),
    );
    const items = await Promise.all(
      categories.map((c, i) =>
        db.menuItem.create({
          data: {
            restaurantId: r.id,
            categoryId: c.id,
            name: `Test food ${i}`,
            price: 125,
          },
        }),
      ),
    );
    const cookies: string[] = [];
    const sessions = Array.from({ length: 10 }, (_, i) => {
      const raw = token();
      cookies.push(`${sessionCookie(r.slug)}=${raw}`);
      return {
        restaurantId: r.id,
        customerName: `Test Guest ${i}`,
        sessionToken: hash(raw),
        expiresAt: new Date(Date.now() + 3600000),
      };
    });
    await db.orderSession.createMany({ data: sessions });
    const raw = token();
    await db.authSession.create({
      data: {
        userId: owner.id,
        tokenHash: hash(raw),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const socket = await connect(`${adminCookie}=${raw}`, { role: "admin" });
    socket.on("order:new", (o: any) => {
      if (o.restaurantId !== r.id) wrongRoom = true;
      if (events.has(o.id)) duplicateEvents++;
      events.add(o.id);
      realtimeEvents++;
    });
    await Promise.all(
      cookies.slice(0, 2).map((cookie) => connect(cookie, { slug: r.slug })),
    );
    hotels.push({
      id: r.id,
      slug: r.slug,
      code: r.orderCode,
      itemId: items[0].id,
      cookies,
    });
  }
  checks.socketConnections =
    sockets.length === 300 && sockets.every((s) => s.connected);
  const order = (h: (typeof hotels)[number], index: number) =>
    request("/api/public/orders", h.cookies[index], {
      restaurantSlug: h.slug,
      idempotencyKey: randomUUID(),
      items: [{ menuItemId: h.itemId, quantity: 2, price: 0.01 }],
      subtotal: 0.01,
      year: 1999,
    });
  await phase("100-hotels-orders", 1000, 100, (i) =>
    order(hotels[Math.floor(i / 10)], i % 10),
  );
  await phase("100-hotels-mixed", 1500, 100, (i) => {
    const h = hotels[Math.floor(i / 15)],
      slot = i % 15;
    if (slot < 5)
      return request("/api/public/service-requests", h.cookies[slot], {
        restaurantSlug: h.slug,
        type: "REQUEST_BILL",
        paymentMethod: slot % 2 ? "UPI" : "CASH",
      });
    if (slot < 10) return order(h, slot);
    return request(`/api/public/restaurants/${h.slug}/menu`);
  });
  // 3,000 menu requests on one IP no longer consume the order/health quota.
  await phase("shared-IP-menu", 3000, 100, (i) =>
    request(`/api/public/restaurants/${hotels[i % 100].slug}/menu`),
  );
  checks.sharedIpHealth = (await request("/api/health")).status === 200;
  checks.sharedIpOrder = (await order(hotels[0], 9)).status === 201;
  if (
    results.some((r) =>
      Object.keys(r.statuses).some((s) => !["200", "201"].includes(s)),
    )
  )
    throw new Error("Burst failed; refusing to start soak");
  const duration = Number(process.env.SOAK_SECONDS || 900);
  if (duration < 900 || duration > 1800)
    throw new Error("Soak must be 15–30 minutes");
  const soakStart = performance.now();
  let tick = 0;
  while (performance.now() - soakStart < duration * 1000) {
    const minuteStart = performance.now();
    await phase(
      `soak-minute-${Math.floor((minuteStart - soakStart) / 60000) + 1}`,
      120,
      2,
      async () => {
        // Each worker issues an order plus a menu read, then waits one second.
        const i = tick++,
          h = hotels[i % 100],
          index = 5 + (Math.floor(i / 100) % 5);
        const r = await order(h, index);
        const menu = await request(`/api/public/restaurants/${h.slug}/menu`);
        if (menu.status !== 200) checks.soakMenu = false;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return r;
      },
    );
  }
  checks.soakDuration = performance.now() - soakStart >= 900000;
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const orders = await db.order.findMany({
    where: { restaurantId: { in: restaurantIds } },
    include: { items: true },
  });
  persistedOrders = orders.length;
  checks.pricing =
    orders.length >= 1501 &&
    orders.every(
      (o) =>
        Number(o.subtotal) === 250 && Number(o.items[0].priceSnapshot) === 125,
    );
  checks.numbers = hotels.every((h) => {
    const values = orders
      .filter((o) => o.restaurantId === h.id)
      .sort((a, b) => a.orderCounter - b.orderCounter);
    return values.every(
      (o, i) =>
        o.orderCounter === i + 1 &&
        o.orderNumber ===
          `${h.code}:${o.orderYear}:${String(i + 1).padStart(6, "0")}`,
    );
  });
  checks.noLoss = orders.length === 1501 + tick;
  checks.realtime =
    events.size === orders.length &&
    realtimeEvents === orders.length &&
    !wrongRoom &&
    !duplicateEvents;
  checks.noUnexpectedHttpFailures = results.every((r) =>
    Object.keys(r.statuses).every((s) => ["200", "201"].includes(s)),
  );
  checks.healthyAfterLoad = (await request("/api/health")).status === 200;
  console.log(JSON.stringify({ checks, persistedOrders, realtimeEvents }));
} finally {
  sockets.forEach((s) => s.disconnect());
  if (restaurantIds.length) {
    await removeStressThrottles(db, restaurantIds);
    const where = { restaurantId: { in: restaurantIds } };
    await db.serviceRequest.deleteMany({ where });
    await db.order.deleteMany({ where });
    await db.orderSession.deleteMany({ where });
    await db.menuItem.deleteMany({ where });
    await db.menuCategory.deleteMany({ where });
    await db.restaurant.deleteMany({ where: { id: { in: restaurantIds } } });
  }
  if (ownerIds.length)
    await db.user.deleteMany({ where: { id: { in: ownerIds } } });
  await db.$disconnect();
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/stress-platform.json",
    JSON.stringify(
      {
        startedAt,
        endedAt: new Date(),
        environment:
          "Local development server, 100 hotels, 1000 guest sessions, 300 sockets, single IP",
        results,
        checks,
        persistedOrders,
        realtimeEvents,
        fixturesRemoved: true,
      },
      null,
      2,
    ),
  );
}
if (Object.values(checks).some((v) => !v)) process.exitCode = 1;

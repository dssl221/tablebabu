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
const slug = `stress-${randomUUID().slice(0, 8)}`;
const results: any[] = [],
  sockets: Socket[] = [];
let ownerId = "",
  restaurantId = "";
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
try {
  if ((await request("/api/health")).status !== 200)
    throw new Error("Server unavailable");
  ownerId = (
    await db.user.create({
      data: {
        name: "Load Test",
        email: `${slug}@example.test`,
        passwordHash: "disabled-test-login",
      },
    })
  ).id;
  restaurantId = (
    await db.restaurant.create({
      data: {
        ownerId,
        slug,
        name: "Isolated stress test",
        openingTime: "00:00",
        closingTime: "00:00",
      },
    })
  ).id;
  const category = await db.menuCategory.create({
    data: { restaurantId, name: "Test menu" },
  });
  const item = await db.menuItem.create({
    data: {
      restaurantId,
      categoryId: category.id,
      name: "Test dish",
      price: 125,
    },
  });
  const cookies: string[] = [];
  // Seed independent guest credentials to avoid turning order load into an IP session-limit test.
  for (let i = 0; i < 100; i++) {
    const raw = token();
    await db.orderSession.create({
      data: {
        restaurantId,
        customerName: `Guest ${i}`,
        sessionToken: hash(raw),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    cookies.push(`${sessionCookie(slug)}=${raw}`);
  }
  const raw = token();
  await db.authSession.create({
    data: {
      userId: ownerId,
      tokenHash: hash(raw),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const admin = await connect(`${adminCookie}=${raw}`, { role: "admin" });
  const events = new Set<string>();
  let eventCount = 0;
  admin.on("order:new", (order: any) => {
    eventCount++;
    events.add(order.id);
  });
  await Promise.all(
    cookies.slice(0, 50).map((cookie) => connect(cookie, { slug })),
  );
  checks.socketConnections =
    sockets.length === 51 && sockets.every((s) => s.connected);
  await request(`/api/public/restaurants/${slug}/menu`);
  for (const concurrency of [10, 50, 100])
    await phase(`menu-${concurrency}`, 200, concurrency, () =>
      request(`/api/public/restaurants/${slug}/menu`),
    );
  const body = (key: string) => ({
    restaurantSlug: slug,
    idempotencyKey: key,
    items: [{ menuItemId: item.id, quantity: 2 }],
    subtotal: 1,
  });
  for (const concurrency of [10, 25, 50, 100])
    await phase(
      `orders-${concurrency}`,
      concurrency >= 50 ? 200 : 100,
      concurrency,
      (i) =>
        request(
          "/api/public/orders",
          cookies[i % cookies.length],
          body(randomUUID()),
        ),
    );
  const key = randomUUID();
  const duplicate = await phase("duplicate-submit", 10, 10, () =>
    request("/api/public/orders", cookies[0], body(key)),
  );
  checks.idempotency =
    duplicate.every((s) => [200, 201].includes(s.status)) &&
    new Set(duplicate.map((s) => s.data?.id)).size === 1;
  const throttle = await phase("order-rate-limit", 50, 10, () =>
    request("/api/public/orders", cookies[1], body(randomUUID())),
  );
  checks.rateLimit =
    throttle.some((s) => s.status === 429) &&
    throttle.every((s) => [201, 429].includes(s.status));
  const sessionQuota = await phase("session-rate-limit", 620, 10, () =>
    request("/api/public/sessions", "", {
      restaurantSlug: slug,
      customerName: "Test Guest",
    }),
  );
  checks.sessionCreationLimit = sessionQuota.some(s => s.status === 429) && sessionQuota.every(s => [201,429].includes(s.status));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const orders = await db.order.findMany({
    where: { restaurantId },
    include: { items: true },
  });
  checks.ordersPersisted = orders.length >= 601;
  persistedOrders = orders.length;
  realtimeEvents = eventCount;
  checks.hotelNumberFormat = orders.every((o) =>
    /^H[A-F0-9]+:[0-9]{4}:[0-9]{6,}$/.test(o.orderNumber),
  );
  checks.serverPricing = orders.every(
    (o) =>
      Number(o.subtotal) === 250 && Number(o.items[0].priceSnapshot) === 125,
  );
  checks.uniqueNumbers =
    new Set(orders.map((o) => o.orderNumber)).size === orders.length;
  checks.realtimeExactlyOnce =
    events.size === orders.length && eventCount === orders.length;
  checks.healthyAfterLoad = (await request("/api/health")).status === 200;
  checks.noUnexpectedHttpFailures = results.every((r) =>
    Object.keys(r.statuses).every((s) =>
      [
        "200",
        "201",
        ...(r.name.includes("rate-limit") ? ["429"] : []),
      ].includes(s),
    ),
  );
  console.log(
    JSON.stringify({
      checks,
      persistedOrders: orders.length,
      realtimeEvents: eventCount,
    }),
  );
} finally {
  sockets.forEach((s) => s.disconnect());
  if (restaurantId) {
    await removeStressThrottles(db, [restaurantId]);
    await db.serviceRequest.deleteMany({ where: { restaurantId } });
    await db.order.deleteMany({ where: { restaurantId } });
    await db.orderSession.deleteMany({ where: { restaurantId } });
    await db.menuItem.deleteMany({ where: { restaurantId } });
    await db.menuCategory.deleteMany({ where: { restaurantId } });
    await db.restaurant.delete({ where: { id: restaurantId } });
  }
  if (ownerId) await db.user.delete({ where: { id: ownerId } });
  await db.$disconnect();
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/stress-test.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        environment:
          "Local development server; single host; seeded sessions; no browser rendering or external network",
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

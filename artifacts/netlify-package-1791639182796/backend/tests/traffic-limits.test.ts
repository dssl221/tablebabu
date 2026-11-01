import { test, expect } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { trafficLimits } from "../src/server/traffic-limits";

test("menu abuse is throttled without blocking orders or health on the same IP", async () => {
  const app = express();
  app.use(trafficLimits);
  app.use((_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  const base = `http://127.0.0.1:${address.port}`;
  let next = 0;
  const statuses: number[] = [];
  try {
    await Promise.all(
      Array.from({ length: 50 }, async () => {
        while (next++ < 12010) {
          const r = await fetch(base + "/public/restaurants/hotel/menu");
          statuses.push(r.status);
          await r.arrayBuffer();
        }
      }),
    );
    expect(statuses.filter((s) => s === 200)).toHaveLength(12000);
    expect(statuses.filter((s) => s === 429)).toHaveLength(10);
    expect(
      (await fetch(base + "/public/orders", { method: "POST" })).status,
    ).toBe(200);
    expect((await fetch(base + "/health")).status).toBe(200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 60000);

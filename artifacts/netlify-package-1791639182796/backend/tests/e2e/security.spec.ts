import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { db } from "../../src/server/db";
import { consumeLimit } from "../../src/server/hardening";
import { hash } from "../../src/server/security";

const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const headers = { Origin: origin };
const email = `security-${randomUUID()}@example.test`;
const password = "Security regression passphrase!";
const slug = `security-${randomUUID()}`;
let ownerId: string;
let restaurantId: string;
const counterIdentity = randomUUID();
test.beforeAll(async () => {
  const owner = await db.user.create({
    data: {
      email,
      name: "Security Test",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  ownerId = owner.id;
  const restaurant = await db.restaurant.create({
    data: {
      name: "Security Test",
      slug,
      ownerId,
      isActive: true,
      onboardingStatus: "DRAFT",
    },
  });
  restaurantId = restaurant.id;
});
test.afterAll(async () => {
  await db.restaurant.deleteMany({ where: { id: restaurantId } });
  await db.user.deleteMany({ where: { id: ownerId } });
  await db.securityThrottle.deleteMany({
    where: {
      key: {
        in: [
          `auth-account:${hash(email)}`,
          `security-test:${hash(counterIdentity)}`,
          `password-change:${hash(ownerId)}`,
        ],
      },
    },
  });
  await db.$disconnect();
});

test("nonce CSP blocks injected scripts while login remains interactive", async ({
  page,
}) => {
  const response = await page.goto("/login");
  const policy = response!.headers()["content-security-policy"];
  expect(policy).toContain("'nonce-");
  expect(policy.split("script-src")[1].split(";")[0]).not.toContain(
    "unsafe-inline",
  );
  expect(policy).toContain("frame-ancestors 'none'");
  expect(response!.headers()["permissions-policy"]).toContain("camera=()");
  const nonces = await page
    .locator("script[nonce]")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLScriptElement).nonce),
    );
  expect(nonces.length).toBeGreaterThan(0);
  expect(nonces.every((nonce) => policy.includes(`'nonce-${nonce}'`))).toBe(
    true,
  );
  await page.evaluate(() => {
    const injected = document.createElement("script");
    injected.textContent = "window.securityProbe = true";
    document.body.appendChild(injected);
  });
  expect(await page.evaluate(() => "securityProbe" in window)).toBe(false);
  await expect(
    page.getByRole("button", { name: "Sign in to your restaurant" }),
  ).toBeVisible();
  const second = await page.reload();
  expect(second!.headers()["content-security-policy"]).not.toBe(policy);
});

test("CSRF boundary rejects missing origin and contradictory fetch metadata before parsing", async ({
  request,
}) => {
  const disallowedHeaders: Record<string, string>[] = [
    {},
    { Origin: "https://attacker.example" },
    { ...headers, "Sec-Fetch-Site": "cross-site" },
  ];
  for (const badHeaders of disallowedHeaders) {
    const response = await request.post("/api/auth/login", {
      headers: badHeaders,
      data: { email, password },
    });
    expect(response.status()).toBe(403);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["x-request-id"]).toBeTruthy();
  }
  expect(
    (
      await request.get("/api/auth/me", {
        headers: { Cookie: "admin=invalid" },
      })
    ).status(),
  ).toBe(401);
});

test("login rotates existing credentials and keeps active drafts private", async ({
  request,
  playwright,
}) => {
  expect(
    (
      await request.post("/api/auth/login", {
        headers,
        data: { email, password },
      })
    ).ok(),
  ).toBe(true);
  const first = (await request.storageState()).cookies.find(
    (c) => c.name === "admin",
  )!;
  expect(first.httpOnly).toBe(true);
  expect(first.sameSite).toBe("Lax");
  expect(
    (
      await request.post("/api/auth/login", {
        headers,
        data: { email, password },
      })
    ).ok(),
  ).toBe(true);
  const second = (await request.storageState()).cookies.find(
    (c) => c.name === "admin",
  )!;
  expect(second.value).not.toBe(first.value);
  const replay = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Cookie: `admin=${first.value}` },
  });
  expect((await replay.get("/api/auth/me")).status()).toBe(401);
  await replay.dispose();
  expect((await request.get(`/api/public/restaurants/${slug}`)).status()).toBe(
    404,
  );
  expect(
    (await request.get(`/api/public/restaurants/${slug}/menu`)).status(),
  ).toBe(404);
  expect(
    (
      await request.post("/api/public/sessions", {
        headers,
        data: { restaurantSlug: slug, customerName: "Rahul" },
      })
    ).status(),
  ).toBe(404);
});

test("uploads reject SVG even when disguised as an allowed image", async ({
  request,
}) => {
  await request.post("/api/auth/login", { headers, data: { email, password } });
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
  );
  for (const mimeType of ["image/svg+xml", "image/png"]) {
    const response = await request.post("/api/uploads", {
      headers,
      multipart: { image: { name: "image.png", mimeType, buffer: svg } },
    });
    expect(response.status()).toBe(400);
  }
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const valid = await request.post("/api/uploads", {
    headers,
    multipart: {
      image: { name: "test.png", mimeType: "image/png", buffer: png },
    },
  });
  expect(valid.status()).toBe(201);
  const { url } = await valid.json();
  expect(url).toMatch(/^\/uploads\/[a-z0-9]+\/[A-Za-z0-9_-]+\.webp$/);
  const { unlink } = await import("node:fs/promises");
  await unlink(`${process.cwd()}${url}`);
});

test("password changes require the current password and revoke every signed-in device", async ({
  page,
  playwright,
}) => {
  await db.restaurant.update({
    where: { id: restaurantId },
    data: { onboardingStatus: "LIVE" },
  });
  await page.request.post("/api/auth/login", {
    headers,
    data: { email, password },
  });
  const otherDevice = await playwright.request.newContext({ baseURL: origin });
  await otherDevice.post("/api/auth/login", {
    headers,
    data: { email, password },
  });
  const newPassword = "A different security passphrase!";
  const denied = await page.request.post("/api/auth/password", {
    headers,
    data: { currentPassword: "wrong password", newPassword },
  });
  expect(denied.status()).toBe(401);
  expect((await otherDevice.get("/api/auth/me")).status()).toBe(200);
  await page.goto("/dashboard/settings");
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(newPassword);
  const racingLogin = otherDevice.post("/api/auth/login", {
    headers,
    data: { email, password },
  });
  await page
    .getByRole("button", { name: "Change password & sign out" })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect([200, 401]).toContain((await racingLogin).status());
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  expect((await otherDevice.get("/api/auth/me")).status()).toBe(401);
  expect(
    (
      await otherDevice.post("/api/auth/login", {
        headers,
        data: { email, password },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await otherDevice.post("/api/auth/login", {
        headers,
        data: { email, password: newPassword },
      })
    ).status(),
  ).toBe(200);
  await otherDevice.dispose();
});

test("database rate limits remain atomic across parallel attempts and block account guessing", async ({
  request,
}) => {
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      consumeLimit("security-test", counterIdentity, 4, 3600000),
    ),
  );
  expect(results.filter((result) => result.allowed)).toHaveLength(4);
  await db.securityThrottle.upsert({
    where: { key: `auth-account:${hash(email)}` },
    create: {
      key: `auth-account:${hash(email)}`,
      count: 20,
      expiresAt: new Date(Date.now() + 900000),
    },
    update: { count: 20, expiresAt: new Date(Date.now() + 900000) },
  });
  const response = await request.post("/api/auth/login", {
    headers,
    data: { email, password },
  });
  expect(response.status()).toBe(429);
  expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
});

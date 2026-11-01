import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { token, hash, adminCookie } from "../../src/server/security";
const db = new PrismaClient();
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const suffix = randomUUID();
const ids: string[] = [];
const tokens: string[] = [];
let restaurantId = "",
  roleId = "";
test.beforeAll(async () => {
  const role = await db.platformRole.create({
    data: {
      name: `QR viewer ${suffix}`,
      permissions: ["restaurants:view", "qr:manage"],
    },
  });
  roleId = role.id;
  for (const role of ["ADMIN", "OWNER", "STAFF"] as const) {
    const user = await db.user.create({
      data: {
        name: "QR test",
        email: `qr-${role}-${suffix}@example.test`,
        passwordHash: "unused-test-login",
        role,
        ...(role === "STAFF" ? { platformRoleId: roleId } : {}),
      },
    });
    ids.push(user.id);
    const raw = token();
    tokens.push(raw);
    await db.authSession.create({
      data: {
        userId: user.id,
        tokenHash: hash(raw),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  }
  const r = await db.restaurant.create({
    data: {
      name: `QR Hotel ${suffix}`,
      slug: `qr-${suffix}`,
      ownerId: ids[1],
      employeeAccess: { create: { employeeId: ids[2] } },
    },
  });
  restaurantId = r.id;
});
test.afterAll(async () => {
  if (restaurantId) await db.restaurant.delete({ where: { id: restaurantId } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  if (roleId) await db.platformRole.delete({ where: { id: roleId } });
  await db.$disconnect();
});
test("uploaded payment QR locks automatically and only admins can unlock or replace it", async ({
  browser,
  request,
}) => {
  const headers = (index: number) => ({
    Origin: origin,
    Cookie: `${adminCookie}=${tokens[index]}`,
  });
  const endpoint = `/api/platform/restaurants/${restaurantId}`;
  const png = await QRCode.toBuffer("upi://pay?pa=test@bank&pn=Test&cu=INR");
  const multipart = (version: number, buffer = png) => ({
    version: String(version),
    image: { name: "qr.png", mimeType: "image/png", buffer },
  });
  const context = await browser.newContext();
  await context.addCookies([
    { name: adminCookie, value: tokens[0], url: origin },
  ]);
  const page = await context.newPage();
  await page.goto("/control-room");
  await page.getByLabel("Search restaurants").fill(`QR Hotel ${suffix}`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("button", { name: `Manage QR Hotel ${suffix}`, exact: true })
    .click();
  await page.getByRole("button", { name: "payment QR", exact: true }).click();
  await page
    .getByLabel("QR image", { exact: true })
    .setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Upload & lock QR" }).click();
  await expect(
    page.getByRole("button", { name: "Unlock QR", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("QR image", { exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 360, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/subscription-qr-mobile.png",
    fullPage: true,
  });
  let summary = await (
    await request.get(endpoint, { headers: headers(0) })
  ).json();
  expect(summary).toMatchObject({
    hasQr: true,
    qrUploaded: true,
    qrLocked: true,
  });
  await request.patch("/api/restaurant", {
    headers: headers(1),
    data: {
      acceptingOrders: true,
      subscriptionQrLocked: false,
      subscriptionQrUploaded: false,
      subscriptionUpiId: "attacker@bank",
    },
  });
  const protectedRestaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
  });
  expect(protectedRestaurant.subscriptionQrLocked).toBe(true);
  expect(protectedRestaurant.subscriptionQrUploaded).toBe(true);
  expect(protectedRestaurant.subscriptionUpiId).toBe("");
  const ownerQr = await request.get("/api/subscription/qr", {
    headers: headers(1),
  });
  expect(ownerQr.status()).toBe(200);
  expect(ownerQr.headers()["content-type"]).toContain("image/png");
  expect((await ownerQr.body()).subarray(0, 8)).toEqual(png.subarray(0, 8));
  expect((await request.get("/api/subscription/qr")).status()).toBe(401);
  for (const index of [1, 2]) {
    expect(
      (
        await request.post(endpoint + "/qr/upload", {
          headers: headers(index),
          multipart: multipart(summary.version),
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post(endpoint, {
          headers: headers(index),
          data: { action: "qr-lock", version: summary.version, locked: false },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post(endpoint, {
          headers: headers(index),
          data: {
            action: "qr",
            version: summary.version,
            upiId: "attacker@bank",
            payee: "Attacker",
            amount: null,
          },
        })
      ).status(),
    ).toBe(403);
  }
  expect(
    (
      await request.post(endpoint + "/qr/upload", {
        headers: headers(0),
        multipart: multipart(summary.version),
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post(endpoint, {
        headers: headers(0),
        data: {
          action: "qr",
          version: summary.version,
          upiId: "new@bank",
          payee: "New",
          amount: null,
        },
      })
    ).status(),
  ).toBe(409);
  await page.getByRole("button", { name: "Unlock QR", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Lock QR", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("QR image", { exact: true })).toBeEnabled();
  summary = await (await request.get(endpoint, { headers: headers(0) })).json();
  // Staff remain read-only even after an administrator unlocks the QR.
  expect(
    (
      await request.post(endpoint + "/qr/upload", {
        headers: headers(2),
        multipart: multipart(summary.version),
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(endpoint + "/qr/upload", {
        headers: headers(0),
        multipart: multipart(
          summary.version,
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
          ),
        ),
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(endpoint + "/qr/upload", {
        headers: headers(0),
        multipart: multipart(summary.version - 1),
      })
    ).status(),
  ).toBe(409);
  const race = await Promise.all([
    request.post(endpoint, {
      headers: headers(0),
      data: { action: "qr-lock", version: summary.version, locked: true },
    }),
    request.post(endpoint + "/qr/upload", {
      headers: headers(0),
      multipart: multipart(summary.version),
    }),
  ]);
  expect(race.filter((r) => r.ok())).toHaveLength(1);
  expect(race.filter((r) => r.status() === 409)).toHaveLength(1);
  const final = await (
    await request.get(endpoint, { headers: headers(0) })
  ).json();
  expect(final.qrLocked).toBe(true);
  expect(final.version).toBe(summary.version + 1);
  expect(await db.subscriptionQrImage.count({ where: { restaurantId } })).toBe(
    1,
  );
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await context.close();
});

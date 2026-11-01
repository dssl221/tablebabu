import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
const db = new PrismaClient();
const suffix = randomUUID().slice(0, 10),
  password = "Platform test passphrase!";
const headers = { Origin: process.env.APP_ORIGIN || "http://localhost:3000" };
const platformEmail = `platform-${suffix}@example.test`,
  ownerEmail = `hotel-${suffix}@example.test`,
  otherEmail = `other-hotel-${suffix}@example.test`;
let restaurantId: string, otherId: string, itemId: string;
const userIds: string[] = [];
const slug = `hotel-${suffix}`,
  name = `Hotel ${suffix}`;
test.beforeAll(async () => {
  for (const [email, role] of [
    [platformEmail, "ADMIN"],
    [ownerEmail, "OWNER"],
    [otherEmail, "OWNER"],
  ] as const) {
    const user = await db.user.create({
      data: {
        email,
        role,
        name: "Test Owner",
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    userIds.push(user.id);
  }
  const restaurant = await db.restaurant.create({
    data: {
      name,
      slug,
      ownerId: userIds[1],
      openingTime: "00:00",
      closingTime: "00:00",
    },
  });
  restaurantId = restaurant.id;
  const other = await db.restaurant.create({
    data: {
      name: "Other private hotel",
      slug: `other-${slug}`,
      ownerId: userIds[2],
    },
  });
  otherId = other.id;
  const category = await db.menuCategory.create({
    data: {
      restaurantId,
      name: "Lunch",
      items: { create: [{ name: "Rice", price: 100 }] },
    },
    include: { items: true },
  });
  itemId = category.items[0].id;
});
test.afterAll(async () => {
  for (const id of [restaurantId, otherId].filter(Boolean)) {
    await db.orderItem.deleteMany({ where: { order: { restaurantId: id } } });
    await db.order.deleteMany({ where: { restaurantId: id } });
    await db.serviceRequest.deleteMany({ where: { restaurantId: id } });
    await db.orderSession.deleteMany({ where: { restaurantId: id } });
    await db.menuItem.deleteMany({ where: { restaurantId: id } });
    await db.menuCategory.deleteMany({ where: { restaurantId: id } });
    await db.restaurant.deleteMany({ where: { id } });
  }
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

test("platform admin pushes a private QR, freezes ordering, and activates a manually paid subscription", async ({
  browser,
}) => {
  const platform = await browser.newContext(),
    owner = await browser.newContext(),
    guest = await browser.newContext();
  const result = await platform.request.post("/api/auth/login", {
    headers,
    data: { email: platformEmail, password },
  });
  expect((await result.json()).redirectTo).toBe("/control-room");
  await owner.request.post("/api/auth/login", {
    headers,
    data: { email: ownerEmail, password },
  });
  await guest.request.post("/api/public/sessions", {
    headers,
    data: { restaurantSlug: slug, customerName: "Rahul" },
  });
  const body = {
    restaurantSlug: slug,
    items: [{ menuItemId: itemId, quantity: 1 }],
    idempotencyKey: randomUUID(),
  };
  const initial = await guest.request.post("/api/public/orders", {
    headers,
    data: body,
  });
  expect(initial.status()).toBe(201);
  const order = await initial.json();
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/dashboard");
  const page = await platform.newPage();
  await page.goto("/control-room");
  await page.getByLabel("Search restaurants").fill(name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("button", { name: `Manage ${name}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "payment QR", exact: true }).click();
  await dialog.getByLabel("Your UPI ID").fill("platform@bank");
  await dialog
    .getByLabel("Payment recipient name")
    .fill("Platform Subscription");
  await dialog.getByLabel("Requested amount").fill("999");
  await dialog.getByRole("button", { name: "Save & send QR" }).click();
  await expect(
    ownerPage.getByRole("button", { name: "View subscription payment QR" }),
  ).toBeVisible();
  await ownerPage
    .getByRole("button", { name: "View subscription payment QR" })
    .click();
  await expect(
    ownerPage.getByText("platform@bank", { exact: false }),
  ).toBeVisible();
  expect(
    (await owner.request.get("/api/subscription/qr")).headers()["content-type"],
  ).toContain("image/png");
  const publicInfo = await (
    await guest.request.get(`/api/public/restaurants/${slug}`)
  ).json();
  expect(publicInfo.subscriptionUpiId).toBeUndefined();
  expect((await guest.request.get("/api/subscription/qr")).status()).toBe(401);
  await dialog.getByRole("button", { name: "access", exact: true }).click();
  await dialog
    .getByLabel("Reason shown to the owner")
    .fill("Subscription payment overdue");
  await dialog
    .getByRole("button", { name: "Freeze restaurant", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Unfreeze restaurant", exact: true }),
  ).toBeVisible();
  expect(
    (
      await guest.request.post("/api/public/orders", {
        headers,
        data: { ...body, idempotencyKey: randomUUID() },
      })
    ).status(),
  ).toBe(409);
  await owner.request.patch("/api/restaurant", {
    headers,
    data: {
      acceptingOrders: true,
      platformFrozen: false,
      subscriptionEndsAt: "2099-01-01T00:00:00Z",
    },
  });
  expect(
    (await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } }))
      .platformFrozen,
  ).toBe(true);
  for (const status of ["PREPARING", "COMPLETED"])
    expect(
      (
        await owner.request.patch(`/api/orders/${order.id}/status`, {
          headers,
          data: { status },
        })
      ).ok(),
    ).toBe(true);
  await dialog
    .getByRole("button", { name: "record payment", exact: true })
    .click();
  await dialog.getByLabel("Payment reference (unique)").fill(`UTR-${suffix}`);
  await dialog.getByLabel("I have verified").check();
  await dialog
    .getByRole("button", { name: "Record payment & set dates" })
    .click();
  await expect(dialog.getByText(/Active · \d+ days remaining/)).toBeVisible();
  expect(
    (
      await guest.request.post("/api/public/orders", {
        headers,
        data: { ...body, idempotencyKey: randomUUID() },
      })
    ).status(),
  ).toBe(201);
  expect(await db.subscriptionPayment.count({ where: { restaurantId } })).toBe(
    1,
  );
  expect(await db.platformAction.count({ where: { restaurantId } })).toBe(3);
  await dialog.getByRole("button", { name: "history", exact: true }).click();
  await expect(dialog.getByText(`₹999 · UTR-${suffix}`)).toBeVisible();
  await page.screenshot({
    path: "artifacts/platform-subscription.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await Promise.all([platform.close(), owner.close(), guest.close()]);
});

test("platform routes reject owners and guests, QR stays tenant-scoped, expiry is enforced, and payment retries are atomic", async ({
  playwright,
}) => {
  const admin = await playwright.request.newContext({
    baseURL: process.env.APP_ORIGIN || "http://localhost:3000",
    extraHTTPHeaders: headers,
  });
  const owner = await playwright.request.newContext({
    baseURL: process.env.APP_ORIGIN || "http://localhost:3000",
    extraHTTPHeaders: headers,
  });
  const other = await playwright.request.newContext({
    baseURL: process.env.APP_ORIGIN || "http://localhost:3000",
    extraHTTPHeaders: headers,
  });
  const guest = await playwright.request.newContext({
    baseURL: process.env.APP_ORIGIN || "http://localhost:3000",
    extraHTTPHeaders: headers,
  });
  await admin.post("/api/auth/login", {
    data: { email: platformEmail, password },
  });
  await owner.post("/api/auth/login", {
    data: { email: ownerEmail, password },
  });
  await other.post("/api/auth/login", {
    data: { email: otherEmail, password },
  });
  expect((await guest.get("/api/platform/restaurants")).status()).toBe(401);
  expect((await owner.get("/api/platform/restaurants")).status()).toBe(403);
  expect((await owner.get("/control-room")).status()).toBe(404);
  expect(
    (
      await other.get("/api/subscription/qr", {
        headers: { "X-Restaurant-Id": restaurantId },
      })
    ).status(),
  ).toBe(403);
  expect((await other.get("/api/subscription/qr")).status()).toBe(404);
  const version = (
    await (await admin.get(`/api/platform/restaurants/${restaurantId}`)).json()
  ).version;
  const payment = {
    action: "payment",
    version,
    idempotencyKey: randomUUID(),
    amount: 500,
    reference: `expired-${suffix}`,
    startsAt: "2025-01-01T00:00:00.000Z",
    endsAt: "2025-02-01T00:00:00.000Z",
    unfreeze: true,
  };
  const results = await Promise.all([
    admin.post(`/api/platform/restaurants/${restaurantId}`, { data: payment }),
    admin.post(`/api/platform/restaurants/${restaurantId}`, { data: payment }),
  ]);
  expect(results.every((r) => r.ok())).toBe(true);
  expect(
    await db.subscriptionPayment.count({
      where: { restaurantId, reference: payment.reference },
    }),
  ).toBe(1);
  expect((await owner.get("/api/subscription")).ok()).toBe(true);
  expect(
    (await (await guest.get(`/api/public/restaurants/${slug}`)).json())
      .orderingOpen,
  ).toBe(false);
  expect(
    (
      await guest.post("/api/public/sessions", {
        data: { restaurantSlug: slug, customerName: "Priya" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await admin.post(`/api/platform/restaurants/${restaurantId}`, {
        data: { action: "freeze", version, frozen: false, reason: "" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await admin.post(`/api/platform/restaurants/${restaurantId}`, {
        data: { ...payment, amount: 1 },
      })
    ).status(),
  ).toBe(409);
  const latest = (
    await (await admin.get(`/api/platform/restaurants/${restaurantId}`)).json()
  ).version;
  expect(
    (
      await admin.post(`/api/platform/restaurants/${restaurantId}`, {
        data: { ...payment, version: latest, idempotencyKey: randomUUID() },
      })
    ).status(),
  ).toBe(409);
  await Promise.all([
    admin.dispose(),
    owner.dispose(),
    other.dispose(),
    guest.dispose(),
  ]);
});

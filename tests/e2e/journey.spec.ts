import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { io, type Socket } from "socket.io-client";
const db = new PrismaClient();
const password = "OnlyForTests!2026";
const suffix = randomUUID().slice(0, 8);
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const headers = { Origin: origin };
let tenant: { id: string; slug: string; ownerId: string; orderCode: string };
let other: typeof tenant;
let dishId: string;
let dessertId: string;
let categoryId: string;
let foreignItem: string;
const email = `journey-${suffix}@example.test`;
const otherEmail = `other-${suffix}@example.test`;
test("visible logout works on desktop and mobile and revokes the owner session", async ({
  browser,
}) => {
  for (const width of [1440, 360]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    await context.request.post("/api/auth/login", {
      headers,
      data: { email, password },
    });
    const cookie = (await context.cookies()).find((c) => c.name === "admin")!;
    const tokenHash = createHash("sha256").update(cookie.value).digest("hex");
    const page = await context.newPage();
    await page.goto("/dashboard");
    const logout = page.getByRole("button", { name: "Log out", exact: true });
    await expect(logout).toBeVisible();
    await expect(logout).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await logout.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("button", { name: "Sign in to your restaurant" }),
    ).toBeVisible();
    expect((await context.request.get("/api/auth/me")).status()).toBe(401);
    expect(
      await db.authSession.findUnique({ where: { tokenHash } }),
    ).toBeNull();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await context.close();
  }
});
test.beforeAll(async () => {
  async function createTenant(email: string, slug: string) {
    const owner = await db.user.create({
      data: {
        name: "Arjun",
        email,
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    return db.restaurant.create({
      data: {
        ownerId: owner.id,
        name: "Bengal Bistro",
        slug,
        openingTime: "00:00",
        closingTime: "00:00",
        description: "A little tradition. A lot of flavour.",
        bannerUrl: "/images/restaurant.webp",
      },
    });
  }
  tenant = await createTenant(email, `journey-${suffix}`);
  other = await createTenant(otherEmail, `other-${suffix}`);
  const category = await db.menuCategory.create({
    data: {
      restaurantId: tenant.id,
      name: "Biryani",
      items: {
        create: [
          {
            name: "Chicken Biryani",
            description:
              "Fragrant basmati, tender chicken and our house spices.",
            price: 290,
            isVeg: false,
            isPopular: true,
            imageUrl: "/images/biryani.webp",
          },
          {
            name: "Gulab Jamun",
            description: "Warm cardamom-scented dumplings.",
            price: 120,
            sortOrder: 1,
          },
        ],
      },
    },
    include: { items: true },
  });
  categoryId = category.id;
  dishId = category.items.find((i) => i.name === "Chicken Biryani")!.id;
  dessertId = category.items.find((i) => i.name === "Gulab Jamun")!.id;
  const foreign = await db.menuCategory.create({
    data: {
      restaurantId: other.id,
      name: "Private",
      items: { create: [{ name: "Other dish", price: 100 }] },
    },
    include: { items: true },
  });
  foreignItem = foreign.items[0].id;
});
test.afterAll(async () => {
  for (const t of [tenant, other].filter(Boolean)) {
    await db.orderItem.deleteMany({ where: { order: { restaurantId: t.id } } });
    await db.order.deleteMany({ where: { restaurantId: t.id } });
    await db.serviceRequest.deleteMany({ where: { restaurantId: t.id } });
    await db.orderSession.deleteMany({ where: { restaurantId: t.id } });
    await db.menuItem.deleteMany({ where: { restaurantId: t.id } });
    await db.menuCategory.deleteMany({ where: { restaurantId: t.id } });
    await db.restaurant.delete({ where: { id: t.id } });
    await db.user.delete({ where: { id: t.ownerId } });
  }
  await db.$disconnect();
});

test("Rahul: name → yearly hotel order → live preparation → dessert → bill → paid → closed", async ({
  browser,
}) => {
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const admin = await adminContext.newPage();
  await admin.goto("/login");
  await admin.getByLabel("Email address").fill(email);
  await admin.getByLabel("Password", { exact: true }).fill(password);
  await admin
    .getByRole("button", { name: "Sign in to your restaurant" })
    .click();
  await expect(
    admin.getByRole("heading", { name: "Welcome back, Arjun." }),
  ).toBeVisible();
  await admin.getByRole("link", { name: "Restaurant QR", exact: true }).click();
  await expect(
    admin.getByAltText("Scan to order at Bengal Bistro"),
  ).toBeVisible();
  expect(
    (await admin.request.get("/api/qr")).headers()["content-type"],
  ).toContain("image/png");
  await admin.goto("/dashboard/orders");
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const guest = await guestContext.newPage();
  await guest.goto(`/r/${tenant.slug}`);
  await expect(
    guest.getByRole("heading", { name: "Bengal Bistro", exact: true }),
  ).toBeVisible();
  await guest.getByLabel("Your name").fill("Rahul");
  await guest.getByRole("button", { name: "View menu", exact: true }).click();
  await expect(guest.getByText("Hi Rahul")).toBeVisible();
  await guest
    .getByRole("button", { name: "Add Chicken Biryani", exact: true })
    .click();
  await guest.reload();
  await expect(guest.getByText("Hi Rahul")).toBeVisible();
  await guest.getByRole("link", { name: /View cart/ }).click();
  await guest.getByRole("button", { name: /Place order/ }).click();
  await expect(
    guest.getByText(
      `Order #${tenant.orderCode}:${new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date())}:000001`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    admin.getByRole("heading", { name: "Rahul", exact: true }),
  ).toBeVisible();
  await expect(
    guest.getByLabel(
      `Order ${tenant.orderCode}:${new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date())}:000001 status: received`,
    ),
  ).toBeVisible();
  await expect(guest.locator(".order-progress small")).toHaveText([
    "Received",
    "Preparing",
    "Completed",
  ]);
  await admin
    .getByRole("button", { name: "Start preparing", exact: true })
    .click();
  await expect(
    guest.getByLabel(
      `Order ${tenant.orderCode}:${new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date())}:000001 status: preparing`,
    ),
  ).toBeVisible();
  await expect(admin.locator(".order-card .badge").first()).toHaveText(
    "preparing",
  );
  await admin
    .getByRole("button", { name: "Complete order", exact: true })
    .click();
  await expect(
    guest.getByLabel(
      `Order ${tenant.orderCode}:${new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date())}:000001 status: completed`,
    ),
  ).toBeVisible();
  await expect(admin.locator(".order-tabs")).not.toContainText("accepted");
  await expect(admin.locator(".order-tabs")).not.toContainText("ready");
  await guest.getByRole("link", { name: "Add more food", exact: true }).click();
  await guest
    .getByRole("button", { name: "Add Gulab Jamun", exact: true })
    .click();
  await guest.getByRole("link", { name: /View cart/ }).click();
  await guest.getByRole("button", { name: /Place order/ }).click();
  await expect(
    guest.getByText(
      `Order #${tenant.orderCode}:${new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date())}:000002`,
      { exact: true },
    ),
  ).toBeVisible();
  for (const name of ["Start preparing", "Complete order"])
    await admin.getByRole("button", { name, exact: true }).click();
  const session = await (
    await guest.request.get(`/api/public/sessions/current?slug=${tenant.slug}`)
  ).json();
  expect(session.orders).toHaveLength(2);
  expect(session.total).toBe(410);
  await guest
    .getByRole("button", { name: "Request bill", exact: true })
    .click();
  await expect(
    guest
      .getByRole("dialog")
      .getByRole("button", { name: "Request bill", exact: true }),
  ).toBeDisabled();
  await guest.getByRole("radio", { name: "UPI", exact: true }).check();
  await guest.screenshot({
    path: "artifacts/payment-choice.png",
    fullPage: true,
  });
  await guest
    .getByRole("dialog")
    .getByRole("button", { name: "Request bill", exact: true })
    .click();
  await expect(
    guest.getByText("Bill requested.", { exact: true }),
  ).toBeVisible();
  await admin.getByRole("link", { name: /Customers & bills/ }).click();
  await admin.getByRole("button", { name: /Rahul/ }).click();
  const bill = admin.getByRole("dialog");
  await expect(
    bill.getByText("Payment method: UPI", { exact: true }),
  ).toBeVisible();
  const receiptUrl = `/api/public/sessions/current/receipt?slug=${tenant.slug}`;
  expect((await guest.request.get(receiptUrl)).status()).toBe(409);
  expect((await admin.request.get(receiptUrl)).status()).toBe(401);
  await expect(bill.getByText("₹410", { exact: true })).toBeVisible();
  await bill.getByRole("button", { name: "Mark paid", exact: true }).click();
  await expect(bill.getByText("paid", { exact: true })).toBeVisible();
  await expect(
    guest.getByRole("link", { name: "Download receipt", exact: true }),
  ).toBeVisible();
  const downloadPromise = guest.waitForEvent("download");
  await guest
    .getByRole("link", { name: "Download receipt", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("payment-receipt.html");
  const receipt = await readFile((await download.path())!, "utf8");
  expect(receipt).toContain("PAID · UPI");
  expect(receipt).toContain("Customer: Rahul");
  expect(receipt).toContain("&#8377;410.00");
  expect(receipt).toContain("Chicken Biryani");
  expect(receipt).toContain("Gulab Jamun");
  const receiptPage = await guestContext.newPage();
  await receiptPage.setContent(receipt);
  await expect(receiptPage.getByText("₹410.00", { exact: true })).toBeVisible();
  await receiptPage.screenshot({
    path: "artifacts/payment-receipt.png",
    fullPage: true,
  });
  await receiptPage.close();
  await bill
    .getByRole("button", { name: "Close session", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", { name: "See you soon, Rahul!" }),
  ).toBeVisible();
  const closed = await db.orderSession.findUniqueOrThrow({
    where: { id: session.id },
  });
  expect(closed.status).toBe("COMPLETED");
  expect(closed.paidAt).not.toBeNull();
  expect(await (await guest.request.get(receiptUrl)).text()).toBe(receipt);
  expect(
    (
      await guest.request.post("/api/public/service-requests", {
        headers,
        data: {
          restaurantSlug: tenant.slug,
          type: "REQUEST_BILL",
          paymentMethod: "CASH",
        },
      })
    ).status(),
  ).toBe(409);
  await admin.goto("/dashboard");
  await expect(
    admin.getByRole("heading", { name: "Welcome back, Arjun." }),
  ).toBeVisible();
  await admin.screenshot({ path: "artifacts/dashboard.png", fullPage: true });
  await admin.goto("/dashboard/analytics");
  for (const reportDays of ["7", "14", "21", "30"]) {
    await admin
      .getByLabel("Transaction report period")
      .selectOption(reportDays);
    const reportDownload = admin.waitForEvent("download");
    await admin
      .getByRole("button", { name: "Download PDF", exact: true })
      .click();
    const report = await reportDownload;
    expect(report.suggestedFilename()).toMatch(/^transactions-.*\.pdf$/);
    const data = await readFile((await report.path())!);
    expect(data.subarray(0, 5).toString()).toBe("%PDF-");
    if (reportDays === "30")
      await report.saveAs("artifacts/transaction-report.pdf");
  }
  expect(
    (
      await guest.request.get("/api/analytics/transactions.pdf?days=7")
    ).status(),
  ).toBe(401);
  expect(
    (
      await admin.request.get("/api/analytics/transactions.pdf?days=7", {
        headers: { "X-Restaurant-Id": other.id },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await admin.request.get("/api/analytics/transactions.pdf?days=31")
    ).status(),
  ).toBe(400);
  const upiStats = admin.getByRole("article", {
    name: "UPI payment statistics",
  });
  await expect(upiStats.getByText("1 visit chose this method")).toBeVisible();
  await expect(upiStats.getByText("₹410", { exact: true })).toBeVisible();
  for (const days of ["7", "30", "1"]) {
    await admin.getByLabel("Analytics period").selectOption(days);
    await expect(upiStats.getByText("₹410", { exact: true })).toBeVisible();
  }
  await admin.setViewportSize({ width: 360, height: 800 });
  expect(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await admin.screenshot({
    path: "artifacts/payment-analytics-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await adminContext.close();
  await guestContext.close();
});

test("the same QR accepts independent customers and a new visit after payment before staff closes it", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const owner = await browser.newContext();
  await owner.request.post("/api/auth/login", {
    headers,
    data: { email, password },
  });
  const qrUrl = `/r/${tenant.slug}`;
  const page = await first.newPage();
  const otherPage = await second.newPage();
  const start = async (p: typeof page, name: string) => {
    await p.goto(qrUrl);
    await p.getByLabel("Your name").fill(name);
    await p.getByRole("button", { name: "View menu", exact: true }).click();
    await p
      .getByRole("button", { name: "Add Chicken Biryani", exact: true })
      .click();
    await p.getByRole("link", { name: /View cart/ }).click();
    await p.getByRole("button", { name: /Place order/ }).click();
    await expect(
      p.getByRole("heading", { name: `Thanks, ${name}!` }),
    ).toBeVisible();
  };
  const sessionFor = async (context: typeof first) =>
    (
      await context.request.get(
        `/api/public/sessions/current?slug=${tenant.slug}`,
      )
    ).json();
  await start(page, "Rahul");
  const original = await sessionFor(first);
  await page.getByRole("button", { name: "Request bill", exact: true }).click();
  await page.getByRole("radio", { name: "Cash", exact: true }).check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Request bill", exact: true })
    .click();
  expect((await sessionFor(first)).paymentMethod).toBe("CASH");
  await start(otherPage, "Priya");
  const independent = await sessionFor(second);
  expect(independent.id).not.toBe(original.id);
  expect(independent.orders[0].orderNumber).not.toBe(
    original.orders[0].orderNumber,
  );
  for (const status of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"]) {
    expect(
      (
        await owner.request.patch(
          `/api/orders/${original.orders[0].id}/status`,
          { headers, data: { status } },
        )
      ).ok(),
    ).toBe(true);
  }
  expect(
    (
      await owner.request.post(`/api/sessions/${original.id}/paid`, { headers })
    ).ok(),
  ).toBe(true);
  await expect(
    page.getByRole("link", { name: "Start a new visit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Back to the menu", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("link", { name: "Start a new visit", exact: true })
    .click();
  await expect(page.getByLabel("Your name")).toBeVisible();
  // Scanning the primary QR again also starts the next visit, without closing the old bill.
  await start(page, "Rahul");
  const renewed = await sessionFor(first);
  expect(renewed.id).not.toBe(original.id);
  expect(renewed.status).toBe("ACTIVE");
  expect(renewed.orders).toHaveLength(1);
  expect(renewed.orders[0].orderNumber).not.toBe(
    original.orders[0].orderNumber,
  );
  const settled = await db.orderSession.findUniqueOrThrow({
    where: { id: original.id },
    include: { orders: true },
  });
  expect(settled.status).toBe("BILL_REQUESTED");
  expect(settled.paidAt).not.toBeNull();
  expect(settled.receiptHtml).toContain("PAID · Cash");
  expect(settled.orders).toHaveLength(1);
  expect((await sessionFor(second)).id).toBe(independent.id);
  const analytics = await (
    await owner.request.get("/api/analytics?days=1")
  ).json();
  expect(
    analytics.paymentMethods.find(
      (m: { method: string }) => m.method === "CASH",
    ),
  ).toMatchObject({ visits: 1, paidVisits: 1, collected: 290, pending: 0 });
  expect(
    analytics.paymentMethods.find(
      (m: { method: string }) => m.method === "UNRECORDED",
    ),
  ).toMatchObject({ visits: 2, pendingVisits: 2, collected: 0, pending: 580 });
  expect(
    analytics.paymentMethods.reduce(
      (sum: number, m: { collected: number }) => sum + m.collected,
      0,
    ),
  ).toBe(analytics.collected);
  // Finish the isolated test's orders so later dashboard assertions are unaffected.
  for (const s of [independent, renewed])
    await owner.request.patch(`/api/orders/${s.orders[0].id}/status`, {
      headers,
      data: { status: "CANCELLED" },
    });
  await first.close();
  await second.close();
  await owner.close();
});

test("tenant isolation, server prices, availability, atomic idempotency, socket authorization", async ({
  playwright,
}) => {
  const owner = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: headers,
  });
  const outsider = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: headers,
  });
  const guest = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: headers,
  });
  await owner.post("/api/auth/login", { data: { email, password } });
  await outsider.post("/api/auth/login", {
    data: { email: otherEmail, password },
  });
  expect(
    (
      await outsider.patch(`/api/menu/items/${dishId}`, { data: { price: 1 } })
    ).status(),
  ).toBe(404);
  expect(
    (
      await outsider.post("/api/menu/items", {
        data: { categoryId, name: "Cross tenant", price: 1 },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await outsider.get("/api/orders", {
        headers: { "X-Restaurant-Id": tenant.id },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await guest.post("/api/public/sessions", {
        data: {
          restaurantSlug: tenant.slug,
          customerName: "<script>alert(1)</script>",
        },
      })
    ).status(),
  ).toBe(400);
  const session = await (
    await guest.post("/api/public/sessions", {
      data: { restaurantSlug: tenant.slug, customerName: "Rahul" },
    })
  ).json();
  expect(session.sessionToken).toBeUndefined();
  expect((await outsider.get(`/api/sessions/${session.id}`)).status()).toBe(
    404,
  );
  const body = {
    restaurantSlug: tenant.slug,
    idempotencyKey: randomUUID(),
    items: [{ menuItemId: dishId, quantity: 2, price: 1 }],
    subtotal: 2,
  };
  expect(
    (
      await guest.post("/api/public/orders", {
        data: { ...body, items: [{ menuItemId: foreignItem, quantity: 1 }] },
      })
    ).status(),
  ).toBe(409);
  await owner.patch(`/api/menu/items/${dishId}/availability`, {
    data: { isAvailable: false },
  });
  expect(
    (await guest.post("/api/public/orders", { data: body })).status(),
  ).toBe(409);
  await owner.patch(`/api/menu/items/${dishId}/availability`, {
    data: { isAvailable: true },
  });
  const results = await Promise.all([
    guest.post("/api/public/orders", { data: body }),
    guest.post("/api/public/orders", { data: body }),
  ]);
  expect(results.every((r) => r.ok())).toBe(true);
  const [a, b] = await Promise.all(results.map((r) => r.json()));
  expect(a.id).toBe(b.id);
  expect(Number(a.subtotal)).toBe(580);
  expect(await db.order.count({ where: { orderSessionId: session.id } })).toBe(
    1,
  );
  expect(
    (
      await guest.post("/api/public/orders", {
        data: { ...body, items: [{ menuItemId: dishId, quantity: 3 }] },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await outsider.patch(`/api/orders/${a.id}/status`, {
        data: { status: "ACCEPTED" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await owner.patch(`/api/orders/${a.id}/status`, {
        data: { status: "READY" },
      })
    ).status(),
  ).toBe(409);
  expect((await owner.post(`/api/sessions/${session.id}/close`)).status()).toBe(
    409,
  );
  const badOrigin = await guest.post("/api/public/orders", {
    headers: { Origin: "https://evil.example" },
    data: { ...body, idempotencyKey: randomUUID() },
  });
  expect(badOrigin.status()).toBe(403);
  await owner.patch("/api/restaurant", { data: { acceptingOrders: false } });
  expect(
    (
      await guest.post("/api/public/orders", {
        data: { ...body, idempotencyKey: randomUUID() },
      })
    ).status(),
  ).toBe(409);
  await owner.patch("/api/restaurant", { data: { acceptingOrders: true } });
  const strangerSocket = io(origin, {
    auth: { role: "admin", restaurantId: tenant.id },
    extraHeaders: headers,
    reconnection: false,
  });
  const denied = await new Promise<boolean>((resolve) => {
    strangerSocket.on("connect_error", () => resolve(true));
    strangerSocket.on("connect", () => resolve(false));
  });
  expect(denied).toBe(true);
  strangerSocket.disconnect();
  await owner.patch(`/api/menu/items/${dishId}`, { data: { price: 300 } });
  const edited = await db.menuItem.findUniqueOrThrow({ where: { id: dishId } });
  expect(edited.isVeg).toBe(false);
  expect(edited.isPopular).toBe(true);
  expect(edited.description).toContain("Fragrant");
  expect(
    Number(
      (await db.orderItem.findFirstOrThrow({ where: { orderId: a.id } }))
        .priceSnapshot,
    ),
  ).toBe(290);
  await owner.dispose();
  await outsider.dispose();
  await guest.dispose();
});

test("360px layout, session recovery, and live sold-out updates", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  await page.goto(`/r/${tenant.slug}`);
  await page.getByLabel("Your name").fill("Priya");
  await page.getByRole("button", { name: "View menu", exact: true }).click();
  await expect(page.getByText("Hi Priya")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByText("Hi Priya")).toBeVisible();
  await page.screenshot({
    path: "artifacts/customer-menu-360.png",
    fullPage: true,
  });
  const auth = await context.request.post("/api/auth/login", {
    headers,
    data: { email, password },
  });
  expect(auth.ok()).toBe(true);
  await context.request.patch(`/api/menu/items/${dishId}/availability`, {
    headers,
    data: { isAvailable: false },
  });
  await expect(page.getByText("SOLD OUT", { exact: true })).toBeVisible();
  await context.request.patch(`/api/menu/items/${dishId}/availability`, {
    headers,
    data: { isAvailable: true },
  });
  await expect(
    page.getByRole("button", { name: "Add Chicken Biryani", exact: true }),
  ).toBeVisible();
  await context.close();
});

test("a lost order response can be retried after refresh without a second order", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto(`/r/${tenant.slug}`);
  await page.getByLabel("Your name").fill("Rahul");
  await page.getByRole("button", { name: "View menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Chicken Biryani", exact: true })
    .click();
  await page.getByRole("link", { name: /View cart/ }).click();
  const session = await (
    await context.request.get(
      `/api/public/sessions/current?slug=${tenant.slug}`,
    )
  ).json();
  await page.route(
    "**/api/public/orders",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: /fetch|network|failed/i }),
  ).toBeVisible();
  expect(await db.order.count({ where: { orderSessionId: session.id } })).toBe(
    1,
  );
  await page.reload();
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(
    page.getByRole("heading", { name: "Thanks, Rahul!" }),
  ).toBeVisible();
  expect(await db.order.count({ where: { orderSessionId: session.id } })).toBe(
    1,
  );
  await context.close();
});

test("reconnect recovers missed status events and owner sockets stay tenant-scoped", async ({
  browser,
  playwright,
}) => {
  const owner = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: headers,
  });
  const outsider = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: headers,
  });
  await owner.post("/api/auth/login", { data: { email, password } });
  await outsider.post("/api/auth/login", {
    data: { email: otherEmail, password },
  });
  const cookies = (await outsider.storageState()).cookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const outsiderSocket = io(origin, {
    auth: { role: "admin", restaurantId: tenant.id },
    extraHeaders: { ...headers, Cookie: cookies },
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    outsiderSocket.once("connect", resolve);
    outsiderSocket.once("connect_error", reject);
  });
  const leaked: unknown[] = [];
  outsiderSocket.on("order:new", (payload) => leaked.push(payload));
  outsiderSocket.on("order:ready", (payload) => leaked.push(payload));
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto(`/r/${tenant.slug}`);
  await page.getByLabel("Your name").fill("Sameer");
  await page.getByRole("button", { name: "View menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Chicken Biryani", exact: true })
    .click();
  await page.getByRole("link", { name: /View cart/ }).click();
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(
    page.getByRole("heading", { name: "Thanks, Sameer!" }),
  ).toBeVisible();
  const session = await (
    await context.request.get(
      `/api/public/sessions/current?slug=${tenant.slug}`,
    )
  ).json();
  const order = session.orders[0];
  await context.setOffline(true);
  for (const status of ["ACCEPTED", "PREPARING", "READY"])
    expect(
      (
        await owner.patch(`/api/orders/${order.id}/status`, {
          data: { status },
        })
      ).ok(),
    ).toBe(true);
  await context.setOffline(false);
  await expect(
    page.getByRole("heading", { name: "Your order is ready!" }),
  ).toBeVisible();
  expect(leaked).toHaveLength(0);
  await owner.patch(`/api/orders/${order.id}/status`, {
    data: { status: "COMPLETED" },
  });
  await owner.post(`/api/sessions/${session.id}/paid`);
  expect(
    (
      await context.request.post("/api/public/orders", {
        headers,
        data: {
          restaurantSlug: tenant.slug,
          idempotencyKey: randomUUID(),
          items: [{ menuItemId: dishId, quantity: 1 }],
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await owner.patch(`/api/orders/${order.id}/status`, {
        data: { status: "CANCELLED" },
      })
    ).status(),
  ).toBe(409);
  outsiderSocket.disconnect();
  await owner.dispose();
  await outsider.dispose();
  await context.close();
});

test("menu management, atomic reorder, image uploads and settings stay scoped", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const request = context.request;
  await request.post("/api/auth/login", { headers, data: { email, password } });
  const categoryResponse = await request.post("/api/menu/categories", {
    headers,
    data: { name: "Seasonal specials", sortOrder: 3 },
  });
  expect(categoryResponse.status()).toBe(201);
  const category = await categoryResponse.json();
  const upload = await request.post("/api/uploads", {
    headers,
    multipart: {
      image: {
        name: "dessert.webp",
        mimeType: "image/webp",
        buffer: await readFile("public/images/dessert.webp"),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const image = await upload.json();
  expect(image.url).toContain(`/uploads/${tenant.id}/`);
  const itemResponse = await request.post("/api/menu/items", {
    headers,
    data: {
      categoryId: category.id,
      name: "House Dessert",
      price: 140,
      description: "Made in our kitchen.",
      imageUrl: image.url,
      isVeg: true,
      isPopular: true,
    },
  });
  expect(itemResponse.status()).toBe(201);
  const item = await itemResponse.json();
  expect(
    (
      await request.post("/api/menu/items/reorder", {
        headers,
        data: { categoryId, itemIds: [dessertId, dishId] },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await db.menuItem.findMany({
        where: { restaurantId: tenant.id, categoryId },
        orderBy: { sortOrder: "asc" },
      })
    ).map((i) => i.id),
  ).toEqual([dessertId, dishId]);
  expect(
    (
      await request.post("/api/menu/items/reorder", {
        headers,
        data: { categoryId, itemIds: [dishId, foreignItem] },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.patch("/api/restaurant", {
        headers,
        data: {
          accentColor: "#b75735",
          description: "Fresh food, warm welcomes.",
        },
      })
    ).ok(),
  ).toBe(true);
  const page = await context.newPage();
  await page.goto("/dashboard/menu");
  await expect(
    page.getByRole("heading", { name: "Your menu", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "House Dessert", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("switch", { name: "House Dessert availability", exact: true })
    .click();
  await expect(
    page.getByRole("switch", {
      name: "House Dessert availability",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "false");
  expect(
    (await db.menuItem.findUniqueOrThrow({ where: { id: item.id } }))
      .isAvailable,
  ).toBe(false);
  await page.screenshot({
    path: "artifacts/menu-management.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const invalid = await request.post("/api/uploads", {
    headers,
    multipart: {
      image: {
        name: "bad.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from("<script>alert(1)</script>"),
      },
    },
  });
  expect(invalid.status()).toBe(400);
  const malformed = await request.post("/api/public/orders", {
    headers: { ...headers, "Content-Type": "application/json" },
    data: "{",
  });
  expect(malformed.status()).toBe(400);
  expect((await malformed.json()).error).toBe("Invalid request body.");
  await context.close();
});

test("pages fit phone, tablet and desktop screens with usable navigation", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.request.post("/api/auth/login", {
    headers,
    data: { email, password },
  });
  const page = await context.newPage();
  const fits = async () => {
    const overflowing = await page.evaluate(() => ({
      width: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(
      overflowing.content,
      JSON.stringify(overflowing),
    ).toBeLessThanOrEqual(overflowing.width);
  };
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "",
      "/orders",
      "/sessions",
      "/menu",
      "/analytics",
      "/settings",
      "/qr",
    ]) {
      await page.goto(`/dashboard${route}`);
      await expect(page.locator(".dashboard-content")).toBeVisible();
      await fits();
      if (width === 360 && route === "/menu") {
        await page
          .getByRole("button", { name: "Add dish", exact: true })
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await fits();
        await page
          .getByRole("button", { name: "Close dialog", exact: true })
          .click();
      }
      if (
        (width === 360 || width === 1440) &&
        ["", "/menu", "/analytics"].includes(route)
      )
        await page.screenshot({
          path: `artifacts/responsive-${width}-${route.slice(1) || "overview"}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
    if (width <= 1024) {
      const trigger = page.getByRole("button", {
        name: "Open navigation",
        exact: true,
      });
      await trigger.click();
      await expect(
        page.getByRole("button", { name: "Close navigation", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
    }
  }
  await context.close();
  const guestContext = await browser.newContext({ reducedMotion: "reduce" });
  const guest = await guestContext.newPage();
  for (const width of [360, 768, 1440]) {
    await guest.setViewportSize({ width, height: 900 });
    for (const route of ["/login", "/signup", `/r/${tenant.slug}`]) {
      await guest.goto(route);
      await expect(guest.locator("input").first()).toBeVisible();
      expect(
        await guest.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await guestContext.request.post("/api/public/sessions", {
    headers,
    data: { restaurantSlug: tenant.slug, customerName: "Layout guest" },
  });
  for (const width of [360, 768, 1440]) {
    await guest.setViewportSize({ width, height: 900 });
    for (const route of ["menu", "cart", "order"]) {
      await guest.goto(`/r/${tenant.slug}/${route}`);
      await expect(guest.locator(".customer-header")).toBeVisible();
      expect(
        await guest.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 360 && route === "menu")
        await guest.screenshot({
          path: "artifacts/responsive-customer-menu.png",
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  await guestContext.close();
});

import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { istDayBoundary } from "../../src/lib/time";
const db = new PrismaClient(),
  suffix = randomUUID().slice(0, 8),
  password = "Employee test passphrase!";
const origin = process.env.APP_ORIGIN || "http://localhost:3000",
  headers = { Origin: origin };
const adminEmail = `employee-admin-${suffix}@example.test`,
  email = `employee-${suffix}@example.test`,
  employeeName = `Team ${suffix.replace(/[0-9]/g, "a")}`;
let adminId: string,
  ownerId: string,
  employeeId: string,
  restaurantId: string,
  otherId: string,
  roleId: string;
const hotelName = `Assigned hotel ${suffix}`,
  roleName = `Operations ${suffix}`;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  adminId = (
    await db.user.create({
      data: {
        name: "Team Admin",
        email: adminEmail,
        passwordHash,
        role: "ADMIN",
      },
    })
  ).id;
  ownerId = (
    await db.user.create({
      data: {
        name: "Hotel Owner",
        email: `employee-owner-${suffix}@example.test`,
        passwordHash,
      },
    })
  ).id;
  restaurantId = (
    await db.restaurant.create({
      data: {
        name: hotelName,
        ownerId,
        slug: `assigned-${suffix}`,
        subscriptionUpiId: "private@bank",
        subscriptionPayee: "Private Recipient",
        subscriptionAmount: 999,
      },
    })
  ).id;
  otherId = (
    await db.restaurant.create({
      data: {
        name: `Hidden hotel ${suffix}`,
        ownerId,
        slug: `hidden-${suffix}`,
      },
    })
  ).id;
});
test.afterAll(async () => {
  const employee = await db.user.findUnique({ where: { email } });
  if (employee) await db.user.delete({ where: { id: employee.id } });
  await db.employeeAudit.deleteMany({ where: { actorId: adminId } });
  await db.platformRole.deleteMany({ where: { name: roleName } });
  await db.restaurant.deleteMany({
    where: { id: { in: [restaurantId, otherId].filter(Boolean) } },
  });
  await db.user.deleteMany({
    where: { id: { in: [adminId, ownerId].filter(Boolean) } },
  });
  await db.$disconnect();
});

test("admin creates an employee and role; scoped staff cannot bypass hidden pages or permissions; logout is recorded in IST", async ({
  browser,
}) => {
  const admin = await browser.newContext(),
    staff = await browser.newContext();
  await admin.request.post("/api/auth/login", {
    headers,
    data: { email: adminEmail, password },
  });
  const page = await admin.newPage();
  await page.goto("/control-room");
  await page
    .getByRole("button", { name: "Employees & roles", exact: true })
    .click();
  await page.getByRole("button", { name: "roles", exact: true }).click();
  await page.getByRole("button", { name: "Create role", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Role name").fill(roleName);
  await dialog.getByLabel("Freeze and unfreeze restaurant ordering").check();
  await dialog.getByRole("button", { name: "Save role", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  roleId = (
    await db.platformRole.findUniqueOrThrow({ where: { name: roleName } })
  ).id;
  await page.getByRole("button", { name: "employees", exact: true }).click();
  await page
    .getByRole("button", { name: "Create employee", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Employee name").fill(employeeName);
  await dialog.getByLabel("Email address").fill(email);
  await dialog.getByLabel("Initial password").fill(password);
  await dialog
    .getByRole("combobox", { name: "Role", exact: true })
    .selectOption(roleId);
  await dialog.getByLabel("Find a restaurant").fill(hotelName);
  await dialog.getByRole("checkbox", { name: new RegExp(hotelName) }).check();
  await page.setViewportSize({ width: 360, height: 900 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: "artifacts/employee-create-mobile.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Create employee account" }).click();
  await expect(dialog).not.toBeVisible();
  employeeId = (await db.user.findUniqueOrThrow({ where: { email } })).id;
  expect((await db.user.findUniqueOrThrow({ where: { email } })).role).toBe(
    "STAFF",
  );
  const staffPage = await staff.newPage();
  await staffPage.goto("/login");
  await staffPage.getByLabel("Email address").fill(email);
  await staffPage.getByLabel("Password", { exact: true }).fill(password);
  await staffPage
    .getByRole("button", { name: "Sign in to your restaurant" })
    .click();
  await expect(staffPage).toHaveURL(/\/control-room$/);
  await expect(
    staffPage.getByRole("button", { name: "Employees & roles" }),
  ).toHaveCount(0);
  await expect(
    staffPage.getByRole("button", { name: `Manage ${hotelName}` }),
  ).toBeVisible();
  await expect(
    staffPage.getByRole("button", { name: `Manage Hidden hotel ${suffix}` }),
  ).toHaveCount(0);
  const rows = await (
    await staff.request.get("/api/platform/restaurants")
  ).json();
  expect(rows.total).toBe(1);
  expect(rows.restaurants[0].upiId).toBe("");
  expect(
    (await staff.request.get(`/api/platform/restaurants/${otherId}`)).status(),
  ).toBe(404);
  expect(
    (
      await staff.request.get(`/api/platform/restaurants/${restaurantId}/qr`)
    ).status(),
  ).toBe(403);
  expect((await staff.request.get("/api/platform/employees")).status()).toBe(
    403,
  );
  expect(
    (
      await staff.request.post("/api/platform/employees", {
        headers,
        data: { role: "ADMIN" },
      })
    ).status(),
  ).toBe(403);
  await staffPage.getByRole("button", { name: `Manage ${hotelName}` }).click();
  await expect(
    staffPage.getByRole("button", { name: "record payment", exact: true }),
  ).toHaveCount(0);
  await staffPage
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog" })
    .click();
  await staffPage.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(staffPage).toHaveURL(/\/login$/);
  const activity = await db.loginActivity.findFirstOrThrow({
    where: { userId: employeeId },
  });
  expect(activity.endReason).toBe("LOGOUT");
  expect(activity.endedAt).not.toBeNull();
  await page
    .getByRole("button", { name: "login history", exact: true })
    .first()
    .click();
  await expect(
    page
      .locator("article")
      .filter({ hasText: email })
      .getByText("Logged out", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/IST/).first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "artifacts/employee-login-history.png",
    fullPage: true,
  });
  await admin.close();
  await staff.close();
});

test("role edits and disabling revoke sessions; payment permissions cannot unfreeze; UTC records filter by IST dates", async ({
  playwright,
}) => {
  const admin = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: headers,
    }),
    staff = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: headers,
    });
  await admin.post("/api/auth/login", {
    data: { email: adminEmail, password },
  });
  await staff.post("/api/auth/login", { data: { email, password } });
  expect(
    (
      await admin.patch(`/api/platform/employees/roles/${roleId}`, {
        data: { name: roleName, permissions: ["restaurants:view"], version: 0 },
      })
    ).status(),
  ).toBe(200);
  expect((await staff.get("/api/platform/me")).status()).toBe(401);
  expect(
    (
      await db.loginActivity.findFirstOrThrow({
        where: { userId: employeeId },
        orderBy: { signedInAt: "desc" },
      })
    ).endReason,
  ).toBe("ACCESS_CHANGED");
  await staff.post("/api/auth/login", { data: { email, password } });
  const version = (
    await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } })
  ).subscriptionVersion;
  expect(
    (
      await staff.post(`/api/platform/restaurants/${restaurantId}`, {
        data: { action: "freeze", frozen: true, reason: "Forbidden", version },
      })
    ).status(),
  ).toBe(403);
  const updatedEmail = `updated-${email}`;
  const employeeSettings = {
    email: updatedEmail,
    name: employeeName,
    platformRoleId: "platform-billing",
    allRestaurants: false,
    restaurantIds: [restaurantId],
    isActive: true,
    version: 0,
  };
  expect(
    (
      await admin.patch(`/api/platform/employees/${employeeId}`, {
        data: employeeSettings,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await staff.post("/api/auth/login", { data: { email, password } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await staff.post("/api/auth/login", {
        data: { email: updatedEmail, password },
      })
    ).status(),
  ).toBe(200);
  const payment = {
    action: "payment",
    idempotencyKey: randomUUID(),
    amount: 100,
    reference: `test-${suffix}`,
    startsAt: istDayBoundary("2026-10-06").toISOString(),
    endsAt: istDayBoundary("2026-11-05", true).toISOString(),
    unfreeze: true,
    version,
  };
  expect(
    (
      await staff.post(`/api/platform/restaurants/${restaurantId}`, {
        data: payment,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await staff.post(`/api/platform/restaurants/${restaurantId}`, {
        data: { ...payment, unfreeze: false },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await admin.patch(`/api/platform/employees/${employeeId}`, {
        data: { ...employeeSettings, isActive: false, version: 1 },
      })
    ).status(),
  ).toBe(200);
  expect((await staff.get("/api/platform/me")).status()).toBe(401);
  expect(
    (
      await staff.post("/api/auth/login", { data: { email, password } })
    ).status(),
  ).toBe(401);
  expect(
    (
      await db.loginActivity.findFirstOrThrow({
        where: { userId: employeeId },
        orderBy: { signedInAt: "desc" },
      })
    ).endReason,
  ).toBe("DISABLED");
  expect(
    (
      await admin.patch(`/api/platform/employees/${adminId}`, {
        data: { ...employeeSettings, version: 0 },
      })
    ).status(),
  ).toBe(404);
  const marker = await db.loginActivity.create({
    data: {
      userId: employeeId,
      authSessionId: randomUUID(),
      signedInAt: new Date("2026-10-05T18:31:00Z"),
      expiresAt: new Date("2026-10-06T06:31:00Z"),
      endedAt: new Date("2026-10-05T19:00:00Z"),
      endReason: "LOGOUT",
    },
  });
  const excluded = await db.loginActivity.create({
    data: {
      userId: employeeId,
      authSessionId: randomUUID(),
      signedInAt: new Date("2026-10-05T17:00:00Z"),
      expiresAt: new Date("2026-10-06T05:00:00Z"),
      endedAt: new Date("2026-10-05T18:00:00Z"),
      endReason: "LOGOUT",
    },
  });
  const history = await (
    await admin.get(
      `/api/platform/employees/activity?from=2026-10-06&to=2026-10-06&employeeId=${employeeId}`,
    )
  ).json();
  expect(history.sessions.some((s: { id: string }) => s.id === marker.id)).toBe(
    true,
  );
  expect(
    history.sessions.some((s: { id: string }) => s.id === excluded.id),
  ).toBe(false);
  expect(
    history.sessions.every((s: Record<string, unknown>) => !s.authSessionId),
  ).toBe(true);
  const zone = await db.$queryRaw<
    { zone: string }[]
  >`SELECT current_setting('TimeZone') AS zone`;
  expect(zone[0].zone).toBe("UTC");
  expect(
    (
      await admin.get(
        "/api/platform/employees/activity?from=2026-02-30&to=2026-03-01",
      )
    ).status(),
  ).toBe(400);
  await admin.dispose();
  await staff.dispose();
});

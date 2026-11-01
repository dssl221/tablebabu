import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID, randomBytes, createHash } from "node:crypto";
const db = new PrismaClient();
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const headers = { Origin: origin };
test("hotel enquiries are private, assignable only by admin, and notify the submitting browser", async ({
  browser,
  request,
}) => {
  const users: string[] = [];
  const hotelName = `Enquiry ${randomUUID()}`;
  async function identity(role: "ADMIN" | "STAFF" | "OWNER") {
    const user = await db.user.create({
      data: {
        name: `${role} ${users.length}`,
        email: `enquiry-${randomUUID()}@example.test`,
        passwordHash: "test-only",
        role,
      },
    });
    users.push(user.id);
    const raw = randomBytes(32).toString("base64url");
    await db.authSession.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(raw).digest("hex"),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    return { ...user, headers: { ...headers, Cookie: `admin=${raw}` }, raw };
  }
  const guest = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
  });
  const adminBrowser = await browser.newContext({ baseURL: origin });
  try {
    const admin = await identity("ADMIN"),
      first = await identity("STAFF"),
      second = await identity("STAFF"),
      owner = await identity("OWNER");
    expect((await request.get("/api/platform/enquiries")).status()).toBe(401);
    expect(
      (
        await request.get("/api/platform/enquiries", { headers: owner.headers })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.get("/api/platform/enquiries/assignees", {
          headers: first.headers,
        })
      ).status(),
    ).toBe(403);
    const page = await guest.newPage();
    await page.goto("/get-started");
    await page.getByLabel("Your name", { exact: true }).fill("Rahul");
    await page.getByLabel("Hotel or restaurant name").fill(hotelName);
    await page
      .getByLabel("Email address", { exact: true })
      .fill(`hotel-${randomUUID()}@example.test`);
    await page.getByLabel("City", { exact: true }).fill("Raniganj");
    await page
      .getByLabel("How can we help?")
      .fill("Please call us about setting up a digital menu.");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Send enquiry", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Message received");
    const enquiry = await db.hotelEnquiry.findFirstOrThrow({
      where: { hotelName },
    });
    const payload = {
      ownerName: enquiry.ownerName,
      hotelName,
      city: enquiry.city,
      email: enquiry.email,
      message: enquiry.message,
      phone: "",
      contactAllowed: true,
      idempotencyKey: enquiry.idempotencyKey,
    };
    expect(
      (
        await guest.request.post("/api/public/enquiries", {
          headers,
          data: payload,
        })
      ).status(),
    ).toBe(201);
    expect(await db.hotelEnquiry.count({ where: { hotelName } })).toBe(1);
    expect(
      (
        await guest.request.post("/api/public/enquiries", {
          headers: { Origin: "https://evil.test" },
          data: payload,
        })
      ).status(),
    ).toBe(403);
    expect((await request.get("/api/public/enquiries")).ok()).toBe(true);
    expect(
      (await (await request.get("/api/public/enquiries")).json()).enquiries,
    ).toHaveLength(0);
    const publicData = await (
      await guest.request.get("/api/public/enquiries")
    ).json();
    expect(JSON.stringify(publicData)).not.toContain(enquiry.email);
    expect(JSON.stringify(publicData)).not.toContain(enquiry.browserTokenHash);
    const path = `/api/platform/enquiries/${enquiry.id}`;
    expect(
      (
        await request.patch(path, {
          headers: first.headers,
          data: { version: 0, assignedToId: first.id },
        })
      ).status(),
    ).toBe(404);
    await adminBrowser.addCookies([
      { name: "admin", value: admin.raw, url: origin },
    ]);
    const adminPage = await adminBrowser.newPage();
    await adminPage.goto("/control-room/enquiries");
    const card = adminPage.getByRole("article").filter({ hasText: hotelName });
    await expect(card).toBeVisible();
    await card.getByRole("combobox").selectOption(first.id);
    await card
      .getByRole("button", { name: "Assign request", exact: true })
      .click();
    await expect(
      card.getByRole("button", { name: "Reassign request", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#enquiry-status")).toContainText(
      `${first.name} has been assigned`,
      { timeout: 20000 },
    );
    await page.reload();
    await expect(page.locator("#enquiry-status")).toContainText(
      `${first.name} has been assigned`,
    );
    expect(
      (
        await (
          await request.get("/api/platform/enquiries", {
            headers: first.headers,
          })
        ).json()
      ).enquiries.some((row: { id: string }) => row.id === enquiry.id),
    ).toBe(true);
    expect(
      (
        await (
          await request.get("/api/platform/enquiries", {
            headers: second.headers,
          })
        ).json()
      ).enquiries,
    ).toHaveLength(0);
    expect(
      (
        await request.patch(path, {
          headers: first.headers,
          data: { version: 1, assignedToId: second.id },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.patch(path, {
          headers: second.headers,
          data: { version: 1, status: "CLOSED" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.patch(path, {
          headers: admin.headers,
          data: { version: 0, assignedToId: second.id },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await request.patch(path, {
          headers: first.headers,
          data: { version: 1, status: "CONTACTED" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.patch(path, {
          headers: admin.headers,
          data: { version: 2, assignedToId: second.id },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.patch(path, {
          headers: first.headers,
          data: { version: 3, status: "CLOSED" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.patch(path, {
          headers: second.headers,
          data: { version: 3, status: "CLOSED" },
        })
      ).status(),
    ).toBe(200);
    expect(
      await db.enquiryUpdate.count({ where: { enquiryId: enquiry.id } }),
    ).toBe(4);
    await db.user.update({
      where: { id: first.id },
      data: { isActive: false },
    });
    expect(
      (
        await request.patch(path, {
          headers: admin.headers,
          data: { version: 4, assignedToId: first.id },
        })
      ).status(),
    ).toBe(422);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await db.hotelEnquiry.update({
      where: { id: enquiry.id },
      data: { accessExpiresAt: new Date(0) },
    });
    expect(
      (await (await guest.request.get("/api/public/enquiries")).json())
        .enquiries,
    ).toHaveLength(0);
    expect(
      (
        await guest.request.post("/api/public/enquiries", {
          headers,
          data: payload,
        })
      ).status(),
    ).toBe(401);
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await guest.request.post("/api/public/enquiries", {
        headers,
        data: payload,
      });
      expect(result.status()).toBe(attempt === 2 ? 429 : 401);
    }
  } finally {
    await guest.close();
    await adminBrowser.close();
    await db.hotelEnquiry.deleteMany({ where: { hotelName } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});

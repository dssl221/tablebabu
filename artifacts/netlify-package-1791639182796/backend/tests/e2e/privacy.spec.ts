import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID, createHash } from "node:crypto";
const db = new PrismaClient();
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
test("privacy requests are private, origin-protected, bounded and admin managed", async ({
  request,
  page,
}) => {
  const email = `privacy-${randomUUID()}@example.test`;
  const ids: string[] = [];
  try {
    const data = {
      email,
      type: "ERASURE",
      details: "Please review my restaurant visit information.",
    };
    expect(
      (
        await request.post("/api/privacy/requests", {
          data,
          headers: { Origin: "https://invalid.example" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/privacy/requests", {
          data: { ...data, details: "x".repeat(2001) },
          headers: { Origin: origin },
        })
      ).status(),
    ).toBe(400);
    const result = await request.post("/api/privacy/requests", {
      data,
      headers: { Origin: origin },
    });
    expect(result.status()).toBe(201);
    const { reference } = await result.json();
    expect(Object.keys(await result.json())).toEqual(["reference"]);
    expect((await request.get("/api/platform/privacy-requests")).status()).toBe(
      401,
    );
    let adminCookie = "";
    for (const role of ["OWNER", "STAFF", "ADMIN"] as const) {
      const user = await db.user.create({
        data: {
          name: "Privacy test",
          email: `${role}-${email}`,
          passwordHash: "unused-test-account",
          role,
        },
      });
      ids.push(user.id);
      const token = randomBytes(32).toString("base64url");
      await db.authSession.create({
        data: {
          userId: user.id,
          tokenHash: digest(token),
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      const cookie = `admin=${token}`;
      const response = await request.get("/api/platform/privacy-requests", {
        headers: { Cookie: cookie },
      });
      expect(response.status()).toBe(role === "ADMIN" ? 200 : 403);
      if (role === "ADMIN") adminCookie = cookie;
    }
    const headers = { Origin: origin, Cookie: adminCookie };
    expect(
      (
        await request.patch(`/api/platform/privacy-requests/${reference}`, {
          headers,
          data: { version: 0, status: "RESOLVED", resolution: "" },
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await request.patch(`/api/platform/privacy-requests/${reference}`, {
          headers,
          data: {
            version: 0,
            status: "IN_REVIEW",
            resolution: "Awaiting proportionate verification.",
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.patch(`/api/platform/privacy-requests/${reference}`, {
          headers,
          data: {
            version: 0,
            status: "RESOLVED",
            resolution: "This stale write must be rejected.",
          },
        })
      ).status(),
    ).toBe(409);
    expect(
      (await db.privacyRequest.findUniqueOrThrow({ where: { id: reference } }))
        .status,
    ).toBe("IN_REVIEW");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/legal/contact");
    await expect(
      page.getByRole("heading", {
        name: "Privacy requests & grievances",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByLabel("Your email").fill(email);
    await page
      .getByLabel("Details")
      .fill("Please send information about my data request.");
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page.getByRole("status")).toContainText("Request received");
    await page.goto("/legal/privacy");
    await expect(
      page.getByRole("heading", { name: "Privacy notice", exact: true }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  } finally {
    await db.privacyRequest.deleteMany({ where: { email } });
    await db.securityThrottle.deleteMany({
      where: { key: `privacy-request:${digest(digest(email))}` },
    });
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});

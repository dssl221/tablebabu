import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
const db = new PrismaClient();
test("owner can preview, restore, download and print QR designs", async ({
  page,
  context,
  request,
}) => {
  const id = randomUUID();
  const user = await db.user.create({
    data: {
      name: "QR test",
      email: `qr-${id}@example.test`,
      passwordHash: "unused-test-only",
    },
  });
  try {
    await db.restaurant.create({
      data: {
        ownerId: user.id,
        name: "QR Design Bistro",
        slug: `qr-${id}`,
        onboardingStatus: "LIVE",
        openingTime: "00:00",
        closingTime: "00:00",
      },
    });
    const token = randomBytes(32).toString("base64url");
    await db.authSession.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await context.addCookies([
      {
        name: "admin",
        value: token,
        url: process.env.APP_ORIGIN || "http://localhost:3000",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    expect((await request.get("/api/qr?poster=1")).status()).toBe(401);
    await page.goto("/dashboard/qr");
    await page.getByRole("button", { name: /Signature/ }).click();
    await page.getByRole("button", { name: "Plum", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "match this preview" }),
    ).toBeVisible();
    const download = page.getByRole("link", { name: "Download design PNG" });
    const response = await context.request.get(
      (await download.getAttribute("href"))!,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toContain("attachment");
    expect(await sharp(await response.body()).metadata()).toMatchObject({
      width: 1000,
      height: 1400,
    });
    expect((await context.request.get("/api/qr?color=white")).status()).toBe(
      400,
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: /Signature/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Plum", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Accent color", { exact: true }).fill("#ffdd00");
    await page.getByLabel("Background color", { exact: true }).fill("#142a41");
    await page.getByLabel("Headline", { exact: true }).fill("Welcome & enjoy");
    await page.getByLabel("Typography", { exact: true }).selectOption("serif");
    await expect(
      page.getByRole("link", { name: "Download design PNG" }),
    ).toHaveAttribute("href", /accent=%23ffdd00/);
    await page.reload();
    await expect(page.getByLabel("Headline", { exact: true })).toHaveValue(
      "Welcome & enjoy",
    );
    await expect(page.getByLabel("Accent color", { exact: true })).toHaveValue(
      "#ffdd00",
    );
    await expect(
      page.getByRole("status").filter({ hasText: "match this preview" }),
    ).toBeVisible();
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    const origin = process.env.APP_ORIGIN || "http://localhost:3000";
    expect((await context.request.patch("/api/restaurant", { headers: { Origin: origin }, data: { festivalTheme: "durga-puja" } })).status()).toBe(200);
    const festive = await context.request.get("/api/qr?poster=1");
    expect(festive.status()).toBe(200);
    await page.goto(`/r/qr-${id}`);
    await expect(page.getByText("Shubho Sharodiya", { exact: true })).toBeVisible();
    await page.goto("/dashboard/settings");
    await expect(page.getByLabel("Festival theme", { exact: true })).toHaveValue("durga-puja");
    await page.goto("/dashboard/qr");
    await page.emulateMedia({ media: "print" });
    await expect(
      page.getByRole("region", { name: "QR design options" }),
    ).toBeHidden();
    await expect(page.locator("#print-qr img")).toBeVisible();
  } finally {
    await db.restaurant.deleteMany({ where: { ownerId: user.id } });
    await db.authSession.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});

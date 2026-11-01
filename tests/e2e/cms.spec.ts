import { test, expect } from "@playwright/test";
import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { defaultSiteContent } from "../../src/lib/site-content";
const db = new PrismaClient();
test("CMS isolates drafts, rejects unauthorized and stale changes, publishes and restores", async ({
  request,
  page,
  context,
}) => {
  const before = await db.siteContent.findUnique({ where: { id: "homepage" } });
  const users: string[] = [];
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  try {
    expect((await request.get("/api/platform/content")).status()).toBe(401);
    let adminToken = "";
    for (const role of ["STAFF", "OWNER", "ADMIN"] as const) {
      const user = await db.user.create({
        data: {
          name: "CMS test",
          email: `cms-${randomUUID()}@example.test`,
          role,
          passwordHash: "unused-test",
        },
      });
      users.push(user.id);
      const token = randomBytes(32).toString("base64url");
      await db.authSession.create({
        data: {
          userId: user.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      expect(
        (
          await request.get("/api/platform/content", {
            headers: { Cookie: `admin=${token}` },
          })
        ).status(),
      ).toBe(role === "ADMIN" ? 200 : 403);
      if (role === "ADMIN") adminToken = token;
    }
    const headers = { Cookie: `admin=${adminToken}`, Origin: origin };
    let state = await (
      await request.get("/api/platform/content", { headers })
    ).json();
    const marker = `Draft ${randomUUID().slice(0, 8)}`;
    const content = { ...defaultSiteContent, headline: marker, festivalTheme: "diwali" };
    expect(
      (
        await request.post("/api/platform/content", {
          headers: { ...headers, Origin: "https://evil.test" },
          data: { action: "SAVE", version: state.version, content },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/platform/content", {
          headers,
          data: { action: "SAVE", version: state.version, content },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.post("/api/platform/content", {
          headers,
          data: { action: "PUBLISH", version: state.version },
        })
      ).status(),
    ).toBe(409);
    expect(await (await request.get("/?preview=1")).text()).not.toContain(
      marker,
    );
    expect(
      await (await request.get("/?preview=1", { headers })).text(),
    ).toContain(marker);
    state = await (
      await request.get("/api/platform/content", { headers })
    ).json();
    expect(
      (
        await request.post("/api/platform/content", {
          headers,
          data: { action: "PUBLISH", version: state.version },
        })
      ).status(),
    ).toBe(200);
    expect(await (await request.get("/")).text()).toContain(marker);
    state = await (
      await request.get("/api/platform/content", { headers })
    ).json();
    expect(
      (
        await request.post("/api/platform/content", {
          headers,
          data: {
            action: "RESTORE",
            version: state.version,
            revisionId: state.revisions[0].id,
          },
        })
      ).status(),
    ).toBe(200);
    await context.addCookies([
      { name: "admin", value: adminToken, url: origin },
    ]);
    await page.goto("/control-room");
    await page
      .getByRole("button", { name: "Website content", exact: true })
      .click();
    await expect(page.getByLabel("Main headline")).toHaveValue(marker);
    await expect(page.getByLabel("Festival theme", { exact: true })).toHaveValue("diwali");
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    if (before)
      await db.siteContent.update({
        where: { id: "homepage" },
        data: {
          draft: before.draft!,
          published: before.published ?? Prisma.DbNull,
          version: before.version,
          publishedAt: before.publishedAt,
        },
      });
    else await db.siteContent.deleteMany({ where: { id: "homepage" } });
    await db.siteRevision.deleteMany({ where: { actorId: { in: users } } });
    await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});

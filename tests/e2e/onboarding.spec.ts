import { POLICY_VERSION } from "../../src/lib/legal";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import {
  emptyDraft,
  type OnboardingDraft,
  type OnboardingState,
} from "../../src/lib/onboarding";
const db = new PrismaClient();
const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const headers = { Origin: origin };
const password = "A memorable cafe passphrase!";
const emails: string[] = [];
const credentials = () => {
  const email = `onboarding-${randomUUID().slice(0, 12)}@example.test`;
  emails.push(email);
  return {
    name: "Ananya Sen",
    email,
    password,
    confirmPassword: password,
    termsAccepted: true,
    adultConfirmed: true,
    policyVersion: POLICY_VERSION,
    idempotencyKey: randomUUID(),
  };
};
const validDraft = (slug: string): OnboardingDraft => ({
  ...emptyDraft(),
  details: {
    name: "The Marigold Table",
    slug,
    address: "24 Lake Road, Kolkata",
    phone: "",
    currency: "INR",
    timezone: "Asia/Kolkata",
  },
  brand: {
    ...emptyDraft().brand,
    description: "Seasonal plates. A warm welcome.",
    openingTime: "00:00",
    closingTime: "00:00",
  },
  categories: [
    {
      id: randomUUID(),
      name: "House favourites",
      items: [
        {
          id: randomUUID(),
          name: "Paneer Tikka",
          price: "240",
          description: "From the tandoor, with love.",
          imageUrl: "/images/paneer.webp",
          isVeg: true,
          isPopular: true,
        },
      ],
    },
  ],
});
test.afterAll(async () => {
  for (const email of emails) {
    const user = await db.user.findUnique({
      where: { email },
      include: { restaurants: true },
    });
    if (!user) continue;
    for (const r of user.restaurants) {
      await db.orderItem.deleteMany({
        where: { order: { restaurantId: r.id } },
      });
      await db.order.deleteMany({ where: { restaurantId: r.id } });
      await db.serviceRequest.deleteMany({ where: { restaurantId: r.id } });
      await db.orderSession.deleteMany({ where: { restaurantId: r.id } });
      await db.menuItem.deleteMany({ where: { restaurantId: r.id } });
      await db.menuCategory.deleteMany({ where: { restaurantId: r.id } });
      await db.restaurant.delete({ where: { id: r.id } });
    }
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
});

async function identity(role: "ADMIN" | "OWNER" | "STAFF") {
  const email = `onboarding-${randomUUID()}@example.test`;
  emails.push(email);
  const user = await db.user.create({
    data: { email, name: "Setup tester", role, passwordHash: "unused" },
  });
  const token = randomBytes(32).toString("base64url");
  await db.authSession.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  return token;
}
test("only administrators provision, resume and publish restaurants without changing identity", async ({
  request,
  context,
  page,
}) => {
  expect(
    (
      await request.post("/api/auth/register", { headers, data: credentials() })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/platform/onboarding", {
        headers,
        data: credentials(),
      })
    ).status(),
  ).toBe(401);
  for (const role of ["OWNER", "STAFF"] as const) {
    const cookie = `admin=${await identity(role)}`;
    const h = { ...headers, Cookie: cookie };
    expect(
      (
        await request.post("/api/platform/onboarding", {
          headers: h,
          data: credentials(),
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.get("/api/onboarding?onboardingRestaurant=missing", {
          headers: h,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post(
          "/api/onboarding/launch?onboardingRestaurant=missing",
          { headers: h, data: { version: 0 } },
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.get("/api/qr?onboardingRestaurant=missing", {
          headers: h,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/uploads?onboardingRestaurant=missing", {
          headers: h,
        })
      ).status(),
    ).toBe(403);
  }
  const token = await identity("ADMIN");
  const h = { ...headers, Cookie: `admin=${token}` };
  const account = credentials();
  expect(
    (
      await request.post("/api/platform/onboarding", {
        headers: { ...h, Origin: "https://evil.test" },
        data: account,
      })
    ).status(),
  ).toBe(403);
  const created = await request.post("/api/platform/onboarding", {
    headers: h,
    data: account,
  });
  expect(created.status()).toBe(201);
  expect(created.headers()["set-cookie"]).toBeUndefined();
  const { restaurantId, redirectTo } = await created.json();
  const repeat = await request.post("/api/platform/onboarding", {
    headers: h,
    data: account,
  });
  expect((await repeat.json()).restaurantId).toBe(restaurantId);
  const owner = await db.user.findUniqueOrThrow({
    where: { email: account.email },
  });
  expect(owner.termsAcceptedAt).toBeNull();
  expect(owner.termsVersion).toBeNull();
  const suffix = `?onboardingRestaurant=${restaurantId}`;
  const draft = validDraft(`admin-setup-${randomUUID().slice(0, 8)}`);
  expect(
    (
      await request.get("/api/onboarding?onboardingRestaurant=missing", {
        headers: h,
      })
    ).status(),
  ).toBe(404);
  const saved = await request.patch(`/api/onboarding/draft${suffix}`, {
    headers: h,
    data: { draft, version: 0, currentStep: 4 },
  });
  expect(saved.status()).toBe(200);
  expect(
    (
      await request.patch(`/api/onboarding/draft${suffix}`, {
        headers: h,
        data: { draft, version: 0, currentStep: 4 },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.get(`/api/public/restaurants/${draft.details.slug}/menu`)
    ).status(),
  ).toBe(404);
  await context.addCookies([{ name: "admin", value: token, url: origin }]);
  await page.goto(redirectTo);
  await expect(
    page.getByRole("heading", {
      name: "A final look before your first order.",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "A final look before your first order.",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publish restaurant", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Return to restaurants" }),
  ).toBeVisible();
  expect((await request.get(`/api/qr${suffix}`, { headers: h })).status()).toBe(
    200,
  );
  const state = await (
    await request.get(`/api/onboarding${suffix}`, { headers: h })
  ).json();
  expect(
    (
      await request.post(`/api/onboarding/launch${suffix}`, {
        headers: h,
        data: { version: state.version },
      })
    ).status(),
  ).toBe(200);
  const menu = await (
    await request.get(`/api/public/restaurants/${draft.details.slug}/menu`)
  ).json();
  expect(menu.categories).toHaveLength(1);
  expect(menu.categories[0].items[0].price).toBe("240");
  expect(await db.menuCategory.count({ where: { restaurantId } })).toBe(1);
  expect((await request.get("/api/platform/me", { headers: h })).status()).toBe(
    200,
  );
  expect(
    await db.platformAction.count({
      where: { restaurantId, action: "ONBOARDING_LAUNCHED" },
    }),
  ).toBe(1);
  await page.getByRole("link", { name: "Return to restaurants" }).click();
  await page.getByRole("link", { name: "Add restaurant", exact: true }).click();
  const second = credentials();
  await page.getByLabel("Owner name").fill(second.name);
  await page.getByLabel("Owner email").fill(second.email);
  await page.getByLabel("Initial password").fill(second.password);
  await page
    .getByRole("button", { name: "Create and configure restaurant" })
    .click();
  await expect(
    page.getByLabel("Restaurant name", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Restaurant name", { exact: true })
    .fill("Admin draft cafe");
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await expect(page).toHaveURL(/control-room$/);
  const ownDraft = page.getByRole("article").filter({ hasText: second.email });
  await expect(ownDraft.getByRole("link", { name: "Resume setup" })).toBeVisible();
  await ownDraft.getByRole("link", { name: "Resume setup" }).click();
  await expect(page.getByLabel("Restaurant name", { exact: true })).toHaveValue(
    "Admin draft cafe",
  );
});
test("public signup leads to contact rather than account creation", async ({
  page,
}) => {
  await page.goto("/signup");
  await expect(page).toHaveURL(/get-started$/);
  await expect(
    page.getByRole("link", { name: "Email us directly" }),
  ).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

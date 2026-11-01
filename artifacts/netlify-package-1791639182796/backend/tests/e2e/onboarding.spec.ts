import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
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
    policyVersion: "2026-10-10",
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

test("new owner signs up, resumes a saved draft, builds a menu and launches", async ({
  browser,
}) => {
  const account = credentials();
  const slug = `marigold-${randomUUID().slice(0, 8)}`;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("link", { name: "Set up your restaurant" }).click();
  await expect(
    page.getByRole("heading", { name: "Let’s set your table." }),
  ).toBeVisible();
  await page.getByLabel("Your name", { exact: true }).fill(account.name);
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.locator('input[name="termsAccepted"]').check();
  await page.locator('input[name="adultConfirmed"]').check();
  await page.getByRole("button", { name: "Create account & continue" }).click();
  await expect(
    page.getByRole("heading", { name: "First, the place behind the plate." }),
  ).toBeVisible();
  await page
    .getByLabel("Restaurant name", { exact: true })
    .fill("The Marigold Table");
  await page.getByLabel("Your menu address").fill(slug);
  await page.getByLabel("Restaurant address").fill("24 Lake Road, Kolkata");
  await expect(
    page.getByRole("status").filter({ hasText: "All changes saved" }),
  ).toBeVisible();
  const saved = (await (
    await context.request.get("/api/onboarding")
  ).json()) as OnboardingState;
  expect(saved.draft.details.name).toBe("The Marigold Table");
  await page.reload();
  await expect(page.getByLabel("Restaurant name", { exact: true })).toHaveValue(
    "The Marigold Table",
  );
  await page
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A menu that feels like you." }),
  ).toBeVisible();
  expect(
    (
      await context.request.get(`/api/public/restaurants/${slug}/menu`)
    ).status(),
  ).toBe(404);
  await page
    .getByLabel("A little about your restaurant")
    .fill("Seasonal plates. A warm welcome.");
  await page.getByLabel("Opens at", { exact: true }).fill("00:00");
  await page.getByLabel("Closes at", { exact: true }).fill("00:00");
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in to your restaurant" })
    .click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: "A menu that feels like you." }),
  ).toBeVisible();
  await expect(page.getByLabel("A little about your restaurant")).toHaveValue(
    "Seasonal plates. A warm welcome.",
  );
  await page
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What’s cooking?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create your first category" })
    .click();
  await page
    .getByLabel("Category name 1", { exact: true })
    .fill("House favourites");
  await page.getByLabel("Dish name", { exact: true }).fill("Paneer Tikka");
  await page.getByLabel("Price (INR)", { exact: true }).fill("240");
  await page
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "A final look before your first order.",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/onboarding-review.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Publish restaurant", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You’re ready to welcome guests." }),
  ).toBeVisible();
  await expect(
    page.getByAltText("Restaurant QR for The Marigold Table"),
  ).toBeVisible();
  const menu = await (
    await context.request.get(`/api/public/restaurants/${slug}/menu`)
  ).json();
  expect(menu.categories).toHaveLength(1);
  expect(menu.categories[0].items[0].name).toBe("Paneer Tikka");
  expect(menu.restaurant.orderingOpen).toBe(true);
  await page
    .getByRole("link", { name: "Open your restaurant dashboard", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Ananya." }),
  ).toBeVisible();
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const guestPage = await guest.newPage();
  await guestPage.goto(`/r/${slug}`);
  await expect(
    guestPage.getByRole("heading", { name: "The Marigold Table", exact: true }),
  ).toBeVisible();
  await guestPage.getByLabel("Your name").fill("Rahul");
  await guestPage
    .getByRole("button", { name: "View menu", exact: true })
    .click();
  await guestPage
    .getByRole("button", { name: "Add Paneer Tikka", exact: true })
    .click();
  await guestPage.getByRole("link", { name: /View cart/ }).click();
  await guestPage.getByRole("button", { name: /Place order/ }).click();
  await expect(
    guestPage.getByText(
      `Order #${menu.restaurant.orderCode}:${new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date())}:000001`,
      { exact: true },
    ),
  ).toBeVisible();
  await guest.close();
  await context.close();
});

test("registration retries, tenant isolation, private drafts, slug races and launch idempotency", async ({
  playwright,
}) => {
  const a = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: headers,
  });
  const b = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: headers,
  });
  const anonymous = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: headers,
  });
  const account = credentials();
  const registrations = await Promise.all([
    a.post("/api/auth/register", { data: account }),
    a.post("/api/auth/register", { data: account }),
  ]);
  expect(registrations.every((r) => r.status() === 201)).toBe(true);
  expect(await db.user.count({ where: { email: account.email } })).toBe(1);
  expect(
    (
      await anonymous.post("/api/auth/register", {
        data: { ...account, idempotencyKey: randomUUID() },
      })
    ).status(),
  ).toBe(409);
  expect(
    (await b.post("/api/auth/register", { data: credentials() })).status(),
  ).toBe(201);
  const first = (await (
    await a.get("/api/onboarding")
  ).json()) as OnboardingState;
  const second = (await (
    await b.get("/api/onboarding")
  ).json()) as OnboardingState;
  expect((await anonymous.get("/api/onboarding")).status()).toBe(401);
  expect(
    (
      await b.get("/api/onboarding", {
        headers: { "X-Restaurant-Id": first.restaurant.id },
      })
    ).status(),
  ).toBe(403);
  expect((await a.get("/api/menu")).status()).toBe(409);
  expect(
    (
      await a.patch("/api/restaurant", { data: { acceptingOrders: true } })
    ).status(),
  ).toBe(409);
  expect(
    (
      await anonymous.post("/api/public/sessions", {
        data: { restaurantSlug: first.restaurant.slug, customerName: "Rahul" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await a.post("/api/onboarding/launch", {
        data: { version: first.version },
      })
    ).status(),
  ).toBe(422);
  const draft = validDraft(`reserved-${randomUUID().slice(0, 8)}`);
  const save = await a.patch("/api/onboarding/draft", {
    data: { draft, version: first.version, currentStep: 4 },
  });
  expect(save.ok()).toBe(true);
  const { version } = await save.json();
  expect(
    (
      await a.patch("/api/onboarding/draft", {
        data: {
          draft: {
            ...draft,
            details: { ...draft.details, name: "Stale edit" },
          },
          version: first.version,
          currentStep: 1,
        },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await b.patch("/api/onboarding/draft", {
        data: { draft, version: second.version, currentStep: 2 },
      })
    ).status(),
  ).toBe(409);
  expect((await (await b.get("/api/onboarding")).json()).version).toBe(
    second.version,
  );
  expect(
    (
      await anonymous.get(`/api/public/restaurants/${draft.details.slug}`)
    ).status(),
  ).toBe(404);
  const launches = await Promise.all([
    a.post("/api/onboarding/launch", { data: { version } }),
    a.post("/api/onboarding/launch", { data: { version } }),
  ]);
  expect(launches.every((r) => r.ok())).toBe(true);
  expect(
    await db.menuItem.count({ where: { restaurantId: first.restaurant.id } }),
  ).toBe(1);
  expect(
    await db.menuItem.count({ where: { restaurantId: second.restaurant.id } }),
  ).toBe(0);
  expect(
    (
      await a.patch("/api/onboarding/draft", {
        data: { draft, version, currentStep: 1 },
      })
    ).status(),
  ).toBe(409);
  await a.dispose();
  await b.dispose();
  await anonymous.dispose();
});

test("mobile onboarding fits 360px and recovers conflicting saves without overwriting", async ({
  browser,
}) => {
  const account = credentials();
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
  });
  await context.request.post("/api/auth/register", { headers, data: account });
  const page = await context.newPage();
  await page.goto("/onboarding");
  await expect(
    page.getByRole("heading", { name: "First, the place behind the plate." }),
  ).toBeVisible();
  const remote = (await (
    await context.request.get("/api/onboarding")
  ).json()) as OnboardingState;
  const draft = validDraft(`mobile-${randomUUID().slice(0, 8)}`);
  expect(
    (
      await context.request.patch("/api/onboarding/draft", {
        headers,
        data: { draft, version: remote.version, currentStep: 1 },
      })
    ).ok(),
  ).toBe(true);
  await page
    .getByLabel("Restaurant name", { exact: true })
    .fill("An outdated edit");
  await expect(
    page.getByRole("button", { name: "Reload saved version", exact: true }),
  ).toBeVisible();
  expect(
    (await (await context.request.get("/api/onboarding")).json()).draft.details
      .name,
  ).toBe("The Marigold Table");
  await page
    .getByRole("button", { name: "Reload saved version", exact: true })
    .click();
  await expect(page.getByLabel("Restaurant name", { exact: true })).toHaveValue(
    "The Marigold Table",
  );
  for (let step = 1; step <= 4; step++) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (step < 4)
      await page
        .getByRole("button", { name: "Save & continue", exact: true })
        .click();
  }
  await page.screenshot({
    path: "artifacts/onboarding-mobile.png",
    fullPage: true,
  });
  await context.close();
});

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { token, hash, adminCookie } from "../src/server/security";
import { removeStressThrottles } from "./stress-cleanup";

const origin = process.env.APP_ORIGIN || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Local preview only");
const db = new PrismaClient();
const browser = await chromium.launch();
let ownerId = "",
  restaurantId = "";
try {
  const owner = await db.user.create({
    data: {
      name: "Arjun",
      email: `product-${randomUUID()}@example.test`,
      passwordHash: token(),
    },
  });
  ownerId = owner.id;
  const restaurant = await db.restaurant.create({
    data: {
      ownerId,
      name: "Bengal Bistro",
      slug: `product-${randomUUID()}`,
      openingTime: "00:00",
      closingTime: "00:00",
      description: "Favourites from our kitchen.",
      bannerUrl: "/images/biryani.webp",
    },
  });
  restaurantId = restaurant.id;
  const category = await db.menuCategory.create({
    data: { restaurantId, name: "Favourites" },
  });
  const dishes = [];
  for (const [name, price, image, description] of [
    [
      "Chicken Biryani",
      290,
      "biryani",
      "Fragrant basmati rice, tender chicken and house spices.",
    ],
    [
      "Paneer Butter Masala",
      240,
      "paneer",
      "Soft paneer in a rich tomato and butter gravy.",
    ],
    [
      "Mango Lassi",
      90,
      "lassi",
      "Chilled yoghurt, sweet mango and a hint of cardamom.",
    ],
  ] as const) {
    dishes.push(
      await db.menuItem.create({
        data: {
          restaurantId,
          categoryId: category.id,
          name,
          price,
          imageUrl: `/images/${image}.webp`,
          description,
          isVeg: name !== "Chicken Biryani",
          isPopular: true,
        },
      }),
    );
  }
  const raw = token();
  await db.authSession.create({
    data: {
      userId: ownerId,
      tokenHash: hash(raw),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const ownerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await ownerContext.addCookies([
    { name: adminCookie, value: raw, url: origin },
  ]);
  const guest = await browser.newContext({
    viewport: { width: 390, height: 1100 },
  });
  const headers = { Origin: origin };
  const session = await guest.request.post(origin + "/api/public/sessions", {
    headers,
    data: { restaurantSlug: restaurant.slug, customerName: "Rahul" },
  });
  if (!session.ok()) throw new Error(`Session failed: ${session.status()}`);
  for (const item of dishes.slice(0, 2)) {
    const response = await guest.request.post(origin + "/api/public/orders", {
      headers,
      data: {
        restaurantSlug: restaurant.slug,
        idempotencyKey: randomUUID(),
        items: [{ menuItemId: item.id, quantity: 2 }],
      },
    });
    if (!response.ok()) throw new Error(`Order failed: ${response.status()}`);
  }
  const page = await ownerContext.newPage();
  page.setDefaultTimeout(20000);
  for (const [route, file, heading] of [
    ["/dashboard", "dashboard", "Welcome back, Arjun."],
    ["/dashboard/menu", "menu-management", "Your menu"],
  ]) {
    await page.goto(origin + route);
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    for (const img of await page.locator("img").all())
      await img.evaluate((el) => (el as HTMLImageElement).decode().catch(() => {}));
    await sharp(await page.screenshot())
      .webp({ quality: 90 })
      .toFile(`public/images/product/${file}.webp`);
  }
  const customerPage = await guest.newPage();
  await customerPage.goto(origin + `/r/${restaurant.slug}/menu`);
  await customerPage
    .getByRole("heading", { name: "Chicken Biryani", exact: true })
    .waitFor();
  for (const img of await customerPage.locator("img").all())
    await img.evaluate((el) => (el as HTMLImageElement).decode().catch(() => {}));
  await sharp(await customerPage.screenshot())
    .webp({ quality: 90 })
    .toFile("public/images/product/customer-menu.webp");
  console.log(
    "Captured three actual TableBabu screens with isolated sample data.",
  );
} finally {
  await browser.close();
  if (restaurantId) {
    await removeStressThrottles(db, [restaurantId]);
    const where = { restaurantId };
    await db.serviceRequest.deleteMany({ where });
    await db.order.deleteMany({ where });
    await db.orderSession.deleteMany({ where });
    await db.menuItem.deleteMany({ where });
    await db.menuCategory.deleteMany({ where });
    await db.restaurant.delete({ where: { id: restaurantId } });
  }
  if (ownerId) await db.user.delete({ where: { id: ownerId } });
  await db.$disconnect();
}

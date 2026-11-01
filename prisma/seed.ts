import "dotenv/config";
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
const client = new PrismaClient();
const photos: Record<string, string> = {
  "photo-1517248135467-4c7edcad34c4": "restaurant",
  "photo-1567188040759-fb8a883dc6d8": "paneer",
  "photo-1527477396000-e27163b481c2": "chicken",
  "photo-1603894584373-5ac82b2ae398": "butterchicken",
  "photo-1546833999-b9f581a1996d": "dal",
  "photo-1563379091339-03b21ab4a4f8": "biryani",
  "photo-1642821373181-696a54913e93": "vegetablebiryani",
  "photo-1631452180519-c014fe946bc7": "naan",
  "photo-1546173159-315724a31696": "lassi",
  "photo-1622483767028-3f66f32aef97": "coke",
  "photo-1616429266392-63ba6f1570a1": "dessert",
};
const food = (id: string) => `/images/${photos[id]}.webp`;
async function main(db: Prisma.TransactionClient) {
  const email = process.env.SEED_EMAIL?.toLowerCase();
  const password = process.env.SEED_PASSWORD;
  if (
    !email ||
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72
  )
    throw new Error(
      "Set SEED_EMAIL and SEED_PASSWORD (12+ characters, at most 72 UTF-8 bytes).",
    );
  const existing = await db.user.findUnique({ where: { email } });
  if (
    existing &&
    (await db.menuItem.count({
      where: { restaurant: { ownerId: existing.id } },
    }))
  ) {
    console.log("Owner already exists; no data changed.");
    return;
  }
  const user =
    existing ||
    (await db.user.create({
      data: {
        name: "Arjun",
        email,
        passwordHash: await bcrypt.hash(password, 12),
      },
    }));
  const restaurant =
    (await db.restaurant.findUnique({ where: { slug: "bengal-bistro" } })) ||
    (await db.restaurant.create({
      data: {
        ownerId: user.id,
        name: "Bengal Bistro",
        slug: "bengal-bistro",
        description:
          "A little tradition. A lot of flavour. Freshly made favourites, from our kitchen to your table.",
        phone: "+91 98765 43210",
        address: "18 Park Street, Kolkata, West Bengal",
        openingTime: "11:00",
        closingTime: "23:00",
        bannerUrl: food("photo-1517248135467-4c7edcad34c4"),
      },
    }));
  if (restaurant.ownerId !== user.id)
    throw new Error("The seed restaurant belongs to a different owner.");
  const menu = [
    {
      name: "Starters",
      items: [
        {
          name: "Paneer Tikka",
          description:
            "Smoky tandoor-grilled paneer, peppers and a bright mint chutney.",
          price: 240,
          isVeg: true,
          isPopular: true,
          imageUrl: food("photo-1567188040759-fb8a883dc6d8"),
        },
        {
          name: "Crispy Chilli Chicken",
          description:
            "Golden chicken tossed with peppers in our signature chilli sauce.",
          price: 280,
          isVeg: false,
          isPopular: false,
          imageUrl: food("photo-1527477396000-e27163b481c2"),
        },
      ],
    },
    {
      name: "Main Course",
      items: [
        {
          name: "Butter Chicken",
          description:
            "Tender chicken in a slow-simmered tomato and cream gravy.",
          price: 340,
          isVeg: false,
          isPopular: true,
          imageUrl: food("photo-1603894584373-5ac82b2ae398"),
        },
        {
          name: "Dal Makhani",
          description:
            "Black lentils, slow cooked overnight. Finished with butter and love.",
          price: 220,
          isVeg: true,
          isPopular: false,
          imageUrl: food("photo-1546833999-b9f581a1996d"),
        },
      ],
    },
    {
      name: "Biryani",
      items: [
        {
          name: "Chicken Biryani",
          description:
            "Fragrant basmati, tender chicken and our house blend of spices.",
          price: 290,
          isVeg: false,
          isPopular: true,
          imageUrl: food("photo-1563379091339-03b21ab4a4f8"),
        },
        {
          name: "Vegetable Biryani",
          description:
            "Seasonal vegetables layered with saffron rice and caramelised onions.",
          price: 240,
          isVeg: true,
          isPopular: false,
          imageUrl: food("photo-1642821373181-696a54913e93"),
        },
      ],
    },
    {
      name: "Breads",
      items: [
        {
          name: "Garlic Naan",
          description:
            "Soft tandoori bread with roasted garlic and a brush of butter.",
          price: 65,
          isVeg: true,
          isPopular: true,
          imageUrl: food("photo-1631452180519-c014fe946bc7"),
        },
      ],
    },
    {
      name: "Drinks",
      items: [
        {
          name: "Mango Lassi",
          description:
            "Alphonso mango and thick yogurt, blended until perfectly smooth.",
          price: 120,
          isVeg: true,
          isPopular: true,
          imageUrl: food("photo-1546173159-315724a31696"),
        },
        {
          name: "Coke",
          description: "Chilled, classic and refreshing. 300 ml.",
          price: 60,
          isVeg: true,
          isPopular: false,
          imageUrl: food("photo-1622483767028-3f66f32aef97"),
        },
      ],
    },
    {
      name: "Desserts",
      items: [
        {
          name: "Gulab Jamun",
          description: "Two warm, soft dumplings in a cardamom-scented syrup.",
          price: 120,
          isVeg: true,
          isPopular: true,
          imageUrl: food("photo-1616429266392-63ba6f1570a1"),
        },
      ],
    },
  ];
  for (const [sortOrder, category] of menu.entries())
    await db.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: category.name,
        sortOrder,
        items: {
          create: category.items.map((item, index) => ({
            ...item,
            sortOrder: index,
            preparationTime: 20,
          })),
        },
      },
    });
  console.log(
    "Bengal Bistro created. Sign in with the configured SEED_EMAIL and SEED_PASSWORD.",
  );
}
client
  .$transaction(main, { timeout: 15000 })
  .finally(() => client.$disconnect());

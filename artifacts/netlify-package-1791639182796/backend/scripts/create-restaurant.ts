import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
const input = z
  .object({
    OWNER_NAME: z.string().trim().min(2).max(80),
    OWNER_EMAIL: z
      .string()
      .email()
      .transform((s) => s.toLowerCase()),
    OWNER_PASSWORD: z
      .string()
      .min(12)
      .refine(
        (s) => Buffer.byteLength(s, "utf8") <= 72,
        "Use at most 72 UTF-8 bytes.",
      ),
    RESTAURANT_NAME: z.string().trim().min(2).max(80),
    RESTAURANT_ORDER_CODE: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9]{1,15}$/)
      .optional(),
    RESTAURANT_SLUG: z
      .string()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .parse(process.env);
const db = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash(input.OWNER_PASSWORD, 12);
  await db.$transaction(async (tx) => {
    const owner = await tx.user.create({
      data: { name: input.OWNER_NAME, email: input.OWNER_EMAIL, passwordHash },
    });
    await tx.restaurant.create({
      data: {
        ownerId: owner.id,
        name: input.RESTAURANT_NAME,
        slug: input.RESTAURANT_SLUG,
        orderCode: input.RESTAURANT_ORDER_CODE,
      },
    });
  });
  console.log(
    `Restaurant created: /r/${input.RESTAURANT_SLUG}. Owner can now sign in and add their menu.`,
  );
} catch (error) {
  console.error(
    "Unable to provision restaurant. Email, slug and order code must be unique. No partial tenant was created.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

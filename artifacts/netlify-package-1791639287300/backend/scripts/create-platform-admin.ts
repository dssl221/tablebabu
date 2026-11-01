import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { passwordSchema } from "../src/lib/onboarding";
import { customerNameSchema } from "../src/server/domain";
const db = new PrismaClient();
try {
  const input = z
    .object({
      PLATFORM_ADMIN_NAME: customerNameSchema,
      PLATFORM_ADMIN_EMAIL: z.string().trim().toLowerCase().email().max(254),
      PLATFORM_ADMIN_PASSWORD: passwordSchema,
    })
    .parse(process.env);
  await db.user.create({
    data: {
      name: input.PLATFORM_ADMIN_NAME,
      email: input.PLATFORM_ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(input.PLATFORM_ADMIN_PASSWORD, 12),
      role: "ADMIN",
    },
  });
  console.log(
    "Platform administrator created. Sign in at /login to access /control-room. Remove the provisioning password from your environment afterwards.",
  );
} catch {
  console.error(
    "Administrator creation failed. Provide valid PLATFORM_ADMIN_NAME, PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD, using an email not already registered. No existing account was promoted.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

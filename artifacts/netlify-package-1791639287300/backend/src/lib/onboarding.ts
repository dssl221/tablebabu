import { z } from "zod";
import { IST } from "./time";
import { POLICY_VERSION } from "./legal";
import { customerNameSchema, imageUrl, textField } from "../server/domain";

export const slugSchema = z
  .string()
  .min(3, "Choose a URL with at least 3 characters.")
  .max(60)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and single hyphens.",
  )
  .refine(
    (s) =>
      ![
        "admin",
        "api",
        "dashboard",
        "login",
        "signup",
        "onboarding",
        "support",
        "settings",
      ].includes(s) && !s.startsWith("setup-"),
    "Please choose a different restaurant URL.",
  );
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters for your password.")
  .max(72)
  .refine(
    (s) => new TextEncoder().encode(s).length <= 72,
    "Your password must fit within 72 UTF-8 bytes.",
  )
  .refine(
    (s) =>
      ![
        "password123456",
        "123456789012",
        "qwerty12345678",
        "passwordpassword",
      ].includes(s.toLowerCase()),
    "Choose a less predictable password.",
  );
export const registerSchema = z
  .object({
    name: customerNameSchema,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Enter a valid email address.")
      .max(254),
    password: passwordSchema,
    confirmPassword: z.string(),
    idempotencyKey: z.string().uuid(),
    termsAccepted: z.literal(true),
    adultConfirmed: z.literal(true),
    policyVersion: z.literal(POLICY_VERSION),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Your passwords do not match.",
  });
export const currencies = ["INR", "USD", "GBP", "EUR", "AED"] as const;
export const timezones = [IST] as const;
const dishDraft = z.object({
  id: z.string().uuid(),
  name: textField(100),
  description: textField(500),
  price: z
    .string()
    .max(9)
    .regex(
      /^\d{0,5}(\.\d{0,2})?$/,
      "Enter a price with up to two decimal places.",
    ),
  imageUrl,
  isVeg: z.boolean(),
  isPopular: z.boolean(),
});
export const draftSchema = z
  .object({
    details: z.object({
      name: textField(80),
      slug: z.string().max(60),
      phone: textField(30),
      address: textField(250),
      currency: z.enum(currencies),
      timezone: z.literal(IST),
    }),
    brand: z.object({
      description: textField(500),
      logoUrl: imageUrl,
      bannerUrl: imageUrl,
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      openingTime: z.string().max(5),
      closingTime: z.string().max(5),
    }),
    categories: z
      .array(
        z.object({
          id: z.string().uuid(),
          name: textField(60),
          items: z.array(dishDraft).max(30),
        }),
      )
      .max(10),
    acceptingOrders: z.boolean(),
  })
  .refine(
    (d) => d.categories.reduce((n, c) => n + c.items.length, 0) <= 100,
    "Start with up to 100 dishes. You can add more after launch.",
  )
  .refine((d) => {
    const ids = d.categories.flatMap((c) => [
      c.id,
      ...c.items.map((i) => i.id),
    ]);
    return new Set(ids).size === ids.length;
  }, "Every category and dish must have a unique identifier.");
export type OnboardingDraft = z.infer<typeof draftSchema>;
export const emptyDraft = (): OnboardingDraft => ({
  details: {
    name: "",
    slug: "",
    phone: "",
    address: "",
    currency: "INR",
    timezone: "Asia/Kolkata",
  },
  brand: {
    description: "",
    logoUrl: "",
    bannerUrl: "",
    accentColor: "#c65b36",
    openingTime: "11:00",
    closingTime: "23:00",
  },
  categories: [],
  acceptingOrders: true,
});
export const slugify = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
export type SetupIssue = { field: string; message: string; step: number };
export function setupIssues(d: OnboardingDraft, throughStep = 3): SetupIssue[] {
  const issues: SetupIssue[] = [];
  if (d.details.name.trim().length < 2)
    issues.push({
      field: "details.name",
      message: "Enter your restaurant name (at least 2 characters).",
      step: 1,
    });
  const slug = slugSchema.safeParse(d.details.slug);
  if (!slug.success)
    issues.push({
      field: "details.slug",
      message: slug.error.issues[0].message,
      step: 1,
    });
  if (d.details.address.trim().length < 5)
    issues.push({
      field: "details.address",
      message: "Add an address so guests know where to find you.",
      step: 1,
    });
  if (d.details.phone && !/^\+?[\d ()-]{7,30}$/.test(d.details.phone))
    issues.push({
      field: "details.phone",
      message: "Enter a valid contact number or leave it blank.",
      step: 1,
    });
  try {
    new Intl.DateTimeFormat("en", { timeZone: d.details.timezone });
  } catch {
    issues.push({
      field: "details.timezone",
      message: "Choose a valid time zone.",
      step: 1,
    });
  }
  if (throughStep >= 2)
    for (const field of ["openingTime", "closingTime"] as const)
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.brand[field]))
        issues.push({
          field: `brand.${field}`,
          message: `Choose a valid ${field === "openingTime" ? "opening" : "closing"} time.`,
          step: 2,
        });
  if (throughStep >= 3) {
    if (!d.categories.length)
      issues.push({
        field: "categories",
        message: "Add at least one category and dish before launching.",
        step: 3,
      });
    d.categories.forEach((c, index) => {
      if (c.name.trim().length < 2)
        issues.push({
          field: `categories.${index}.name`,
          message: `Give category ${index + 1} a name.`,
          step: 3,
        });
      if (!c.items.length)
        issues.push({
          field: `categories.${index}.items`,
          message: `Add a dish to ${c.name || "this category"}, or remove the empty category.`,
          step: 3,
        });
      c.items.forEach((i, n) => {
        if (i.name.trim().length < 2)
          issues.push({
            field: `categories.${index}.items.${n}.name`,
            message: `Name dish ${n + 1} in ${c.name || "this category"}.`,
            step: 3,
          });
        if (
          !i.price ||
          !Number.isFinite(Number(i.price)) ||
          Number(i.price) < 1 ||
          Number(i.price) > 99999
        )
          issues.push({
            field: `categories.${index}.items.${n}.price`,
            message: `Set a price between 1 and 99,999 for ${i.name || "your dish"}.`,
            step: 3,
          });
      });
    });
    const names = d.categories.map((c) => c.name.trim().toLowerCase());
    if (new Set(names).size !== names.length)
      issues.push({
        field: "categories",
        message: "Use distinct category names to keep your menu clear.",
        step: 3,
      });
  }
  return issues;
}
export type OnboardingState = {
  draft: OnboardingDraft;
  currentStep: number;
  version: number;
  completedAt: string | null;
  updatedAt: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    onboardingStatus: "DRAFT" | "LIVE";
  };
  user: { name: string; email: string };
  menuUrl: string;
};

import { z } from "zod";
import { IST } from "../lib/time";
import {
  subscriptionAllowsOrders,
  type SubscriptionAccess,
} from "../lib/subscription";
export const cleanText = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[<>\u0000-\u001f\u007f]/g, "")
    .trim();
export const customerNameSchema = z
  .string()
  .transform((s) => cleanText(s).replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(2, "Please enter at least 2 characters.")
      .max(40)
      .regex(
        /^[\p{L}\p{M}][\p{L}\p{M} .’'\-]*$/u,
        "Use a name with letters, spaces, or hyphens.",
      )
      .refine(
        (s) => (s.match(/\p{L}/gu) || []).length >= 2,
        "Please enter your name.",
      ),
  );
export const textField = (max: number) =>
  z.string().transform(cleanText).pipe(z.string().max(max));
export const transitions: Record<string, string[]> = {
  NEW: ["PREPARING", "ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["COMPLETED", "READY", "CANCELLED"],
  READY: ["SERVED", "COMPLETED"],
  SERVED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};
export function isOpen(
  r: SubscriptionAccess & {
    isActive: boolean;
    acceptingOrders: boolean;
    openingTime: string;
    closingTime: string;
    timezone: string;
    onboardingStatus?: string;
  },
  date = new Date(),
) {
  if (
    !r.isActive ||
    !r.acceptingOrders ||
    r.onboardingStatus === "DRAFT" ||
    !subscriptionAllowsOrders(r, date)
  )
    return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const time = `${parts.find((p) => p.type === "hour")!.value}:${parts.find((p) => p.type === "minute")!.value}`;
  if (r.openingTime === r.closingTime) return true;
  return r.openingTime < r.closingTime
    ? time >= r.openingTime && time < r.closingTime
    : time >= r.openingTime || time < r.closingTime;
}
export const imageUrl = z
  .string()
  .max(600)
  .refine(
    (v) =>
      !v ||
      /^\/uploads\/[a-zA-Z0-9_/-]+\.webp$/.test(v) ||
      /^\/images\/[a-z0-9_-]+\.webp$/.test(v) ||
      /^https:\/\//.test(v),
    "Use an HTTPS image URL or upload an image.",
  );
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const settingsSchema = z
  .object({
    name: textField(80).pipe(z.string().min(2)),
    description: textField(500),
    logoUrl: imageUrl,
    bannerUrl: imageUrl,
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    festivalTheme: z.enum(["none", "diwali", "durga-puja", "holi", "eid", "christmas", "new-year"]),
    phone: textField(30),
    address: textField(250),
    gstNumber: textField(30).nullable().optional(),
    openingTime: time,
    closingTime: time,
    timezone: z.literal(IST),
    acceptingOrders: z.boolean(),
  })
  .partial();
export const itemSchema = z.object({
  categoryId: z.string().min(1),
  name: textField(100).pipe(z.string().min(2)),
  description: textField(500).default(""),
  price: z.number().min(1).max(99999).multipleOf(0.01),
  imageUrl: imageUrl.default(""),
  isVeg: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  isPopular: z.boolean().default(false),
  preparationTime: z.number().int().min(1).max(240).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});
export const orderSchema = z
  .object({
    restaurantSlug: z.string().min(1),
    idempotencyKey: z.string().uuid(),
    customerNote: textField(300).optional(),
    items: z
      .array(
        z.object({
          menuItemId: z.string().min(1),
          quantity: z.number().int().min(1).max(20),
          notes: textField(200).default(""),
        }),
      )
      .min(1)
      .max(30),
  })
  .refine(
    (v) => new Set(v.items.map((i) => i.menuItemId)).size === v.items.length,
    "Combine repeated items into one quantity.",
  );

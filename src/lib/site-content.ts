import { z } from "zod";
import { festivalIds } from "./festival-themes";
const defaultFaqs = [
  [
    "Do my guests need an app or an account?",
    "Neither. They scan your QR, enter their name, choose their food and place the order in their browser. No phone number or OTP is required.",
  ],
  [
    "Do I need a QR for every table?",
    "One QR works across your restaurant. Guest names and unique order numbers identify orders, so you can use the same printed code on tables, the counter or the entrance.",
  ],
  [
    "How are payments handled?",
    "Guests select Cash or UPI when requesting their bill. Your team collects and verifies payment at the counter, then marks it received. TableBabu records payment choices and confirmations; it does not process or automatically verify bank payments.",
  ],
  [
    "Can customers add more food to an existing visit?",
    "Yes. Drinks, dessert and additional orders stay attached to the same guest session. Your team sees a combined bill for the visit.",
  ],
  [
    "Can I change my menu after publishing?",
    "Yes. Update dishes, photos, categories, prices and availability in the dashboard. Your restaurant QR stays the same.",
  ],
];
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v));
export const siteContentSchema = z.object({
  festivalTheme: z.enum(festivalIds).default("none"),
  title: text(80),
  description: text(180),
  headline: text(80),
  highlight: text(80),
  introduction: text(300),
  button: text(40),
  heroImage: z.enum([
    "/images/restaurant.webp",
    "/images/biryani.webp",
    "/images/lassi.webp",
  ]),
  faqs: z
    .array(z.tuple([text(160), text(1000)]))
    .min(1)
    .max(12),
});
export type SiteContent = z.infer<typeof siteContentSchema>;
export const defaultSiteContent: SiteContent = {
  festivalTheme: "none",
  title: "TableBabu | Turn your menu into your next order",
  description:
    "QR menus, live restaurant orders and simpler billing. Give guests an easy way to order and your team one place to manage service.",
  headline: "Your guests are ready.",
  highlight: "Let them order.",
  introduction:
    "A menu on their phone. An order on your dashboard. More time for the service they came for.",
  button: "Get started with our team",
  heroImage: "/images/restaurant.webp",
  faqs: defaultFaqs as [string, string][],
};

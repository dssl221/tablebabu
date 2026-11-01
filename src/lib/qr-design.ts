import { z } from "zod";
export const qrTemplates = [
  {
    id: "classic",
    name: "Classic",
    description: "Clean and airy, for any table.",
  },
  {
    id: "frame",
    name: "Signature",
    description: "A colored frame with a warm welcome.",
  },
  {
    id: "bold",
    name: "Bold",
    description: "A strong heading for counters and entrances.",
  },
] as const;
export const qrColors = [
  { id: "forest", name: "Forest", value: "#234b3c" },
  { id: "navy", name: "Navy", value: "#203d63" },
  { id: "terracotta", name: "Terracotta", value: "#873e2b" },
  { id: "plum", name: "Plum", value: "#623653" },
  { id: "charcoal", name: "Charcoal", value: "#252a30" },
] as const;
export type QRTemplate = (typeof qrTemplates)[number]["id"];
export type QRColor = (typeof qrColors)[number]["id"];
export function isQRTemplate(value: unknown): value is QRTemplate {
  return qrTemplates.some((entry) => entry.id === value);
}
export function isQRColor(value: unknown): value is QRColor {
  return qrColors.some((entry) => entry.id === value);
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const qrCustomizationSchema = z.object({
  accent: hex.default("#234b3c"),
  background: hex.default("#ffffff"),
  heading: z
    .string()
    .trim()
    .max(36)
    .regex(/^[^\x00-\x1f]*$/)
    .default("Scan. Order. Enjoy."),
  subtitle: z
    .string()
    .trim()
    .max(60)
    .regex(/^[^\x00-\x1f]*$/)
    .default("View the menu and order from your phone."),
  border: z.coerce.number().int().min(0).max(70).default(30),
  radius: z.coerce.number().int().min(0).max(120).default(24),
  size: z.coerce.number().int().min(500).max(720).default(720),
  font: z.enum(["sans-serif", "serif", "monospace"]).default("sans-serif"),
});
export type QRCustomization = z.infer<typeof qrCustomizationSchema>;
export const defaultQRCustomization = qrCustomizationSchema.parse({});
export function readableInk(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#172027" : "#ffffff";
}
export function scannableInk(hex: string) {
  return readableInk(hex) === "#ffffff" ? hex : "#172027";
}

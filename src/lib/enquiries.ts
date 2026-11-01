import { z } from "zod";
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      "Remove invalid characters.",
    );
export const enquirySchema = z.object({
  ownerName: text(2, 80),
  hotelName: text(2, 120),
  city: text(2, 100),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z
    .string()
    .trim()
    .regex(
      /^(?:\+91[ -]?)?[6-9][0-9]{9}$|^$/,
      "Enter a valid Indian mobile number or leave it blank.",
    )
    .default(""),
  message: text(10, 2000),
  contactAllowed: z.literal(true),
  website: z.string().max(0).default(""),
  idempotencyKey: z.string().uuid(),
});
export const enquiryChangeSchema = z
  .object({
    version: z.number().int().nonnegative(),
    assignedToId: z.string().min(1).max(100).optional(),
    status: z.enum(["CONTACTED", "CLOSED"]).optional(),
  })
  .refine(
    (value) => !!value.assignedToId !== !!value.status,
    "Choose an assignment or a status update.",
  );
export type EnquiryView = {
  id: string;
  hotelName: string;
  status: string;
  version: number;
  createdAt: string;
  assignedTo: { name: string } | null;
  updates: { id: string; message: string; createdAt: string }[];
};
export type AdminEnquiry = EnquiryView & {
  ownerName: string;
  email: string;
  phone: string;
  city: string;
  message: string;
  assignedToId: string | null;
};

import { z } from "zod";
const note = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),
    "Remove invalid control characters.",
  );
export const privacyUpdateSchema = z.object({
  version: z.number().int().nonnegative(),
  status: z.enum(["RECEIVED", "IN_REVIEW", "RESOLVED"]),
  resolution: note,
  verification: note.default(""),
  response: note.default(""),
  acknowledged: z.boolean().default(false),
});
export function canResolvePrivacyRequest(
  value: z.infer<typeof privacyUpdateSchema>,
) {
  return (
    value.resolution.length >= 10 &&
    value.verification.length >= 10 &&
    value.response.length >= 10 &&
    value.acknowledged
  );
}
export function privacyDeadlines(createdAt: string | Date) {
  const start = new Date(createdAt).getTime();
  return {
    acknowledgement: new Date(start + 48 * 3600000),
    response: new Date(start + 30 * 86400000),
  };
}

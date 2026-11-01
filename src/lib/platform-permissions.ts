export const PLATFORM_PERMISSIONS = [
  "restaurants:view",
  "access:manage",
  "qr:manage",
  "payments:view",
  "payments:record",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export const PERMISSION_LABELS: Record<PlatformPermission, string> = {
  "restaurants:view": "View restaurants and subscription dates",
  "access:manage": "Freeze and unfreeze restaurant ordering",
  "qr:manage": "View subscription payment QRs (changes are admin-only)",
  "payments:view": "View subscription payments and action history",
  "payments:record": "Record received payments and set subscription dates",
};

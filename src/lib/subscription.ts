export type SubscriptionAccess = {
  platformFrozen?: boolean;
  subscriptionStartsAt?: Date | string | null;
  subscriptionEndsAt?: Date | string | null;
};
export function subscriptionStatus(r: SubscriptionAccess, now = new Date()) {
  if (r.platformFrozen) return "Frozen";
  if (!r.subscriptionEndsAt) return "Not configured";
  if (new Date(r.subscriptionEndsAt) <= now) return "Expired";
  if (r.subscriptionStartsAt && new Date(r.subscriptionStartsAt) > now)
    return "Scheduled";
  return "Active";
}
export function subscriptionAllowsOrders(
  r: SubscriptionAccess,
  now = new Date(),
) {
  return ["Active", "Not configured"].includes(subscriptionStatus(r, now));
}
export function subscriptionDays(r: SubscriptionAccess, now = new Date()) {
  return r.subscriptionEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(r.subscriptionEndsAt).getTime() - now.getTime()) / 86400000,
        ),
      )
    : null;
}

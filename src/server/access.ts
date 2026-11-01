import type { Prisma } from "@prisma/client";
import type { Request, RequestHandler } from "express";
import { assert, authenticate } from "./security";
import {
  PLATFORM_PERMISSIONS,
  type PlatformPermission,
} from "../lib/platform-permissions";
export type PlatformPrincipal = {
  isAdmin: boolean;
  permissions: string[];
  allRestaurants: boolean;
  restaurantIds: string[];
};
export const principalFor = (user: {
  role: string;
  allRestaurants: boolean;
  platformRole: { permissions: string[] } | null;
  restaurantAccess: { restaurantId: string }[];
}): PlatformPrincipal => ({
  isAdmin: user.role === "ADMIN",
  permissions:
    user.role === "ADMIN"
      ? [...PLATFORM_PERMISSIONS]
      : user.platformRole?.permissions || [],
  allRestaurants: user.role === "ADMIN" || user.allRestaurants,
  restaurantIds: user.restaurantAccess.map((a) => a.restaurantId),
});
export const platformAccess: RequestHandler = async (req, _res, next) => {
  try {
    const auth = await authenticate(req.headers.cookie);
    assert(auth, 401, "Please sign in.");
    assert(
      ["ADMIN", "STAFF"].includes(auth.user.role),
      403,
      "Platform access required.",
    );
    req.userId = auth.userId;
    req.authId = auth.id;
    req.platformPrincipal = principalFor(auth.user);
    next();
  } catch (error) {
    next(error);
  }
};
export function requirePermission(
  req: Request,
  permission: PlatformPermission,
) {
  assert(
    req.platformPrincipal?.permissions.includes(permission),
    403,
    "Your role does not permit this action.",
  );
}
export function restaurantScope(req: Request): Prisma.RestaurantWhereInput {
  requirePermission(req, "restaurants:view");
  return req.platformPrincipal.allRestaurants
    ? {}
    : { id: { in: req.platformPrincipal.restaurantIds } };
}
export async function authorizePlatformWrite(
  tx: Prisma.TransactionClient,
  req: Request,
  restaurantId: string,
  permission: PlatformPermission,
) {
  // Recheck authorization within the same serializable transaction as the write.
  const auth = await tx.authSession.findUnique({
    where: { id: req.authId },
    include: {
      user: { include: { platformRole: true, restaurantAccess: true } },
    },
  });
  assert(
    auth &&
      auth.expiresAt > new Date() &&
      auth.user.isActive &&
      ["ADMIN", "STAFF"].includes(auth.user.role),
    401,
    "Please sign in again.",
  );
  const principal = principalFor(auth.user);
  if (permission === "qr:manage")
    assert(
      principal.isAdmin,
      403,
      "Only a platform administrator can change payment QRs.",
    );
  assert(
    principal.permissions.includes("restaurants:view") &&
      principal.permissions.includes(permission),
    403,
    "Your role does not permit this action.",
  );
  assert(
    principal.allRestaurants || principal.restaurantIds.includes(restaurantId),
    404,
    "Restaurant not found.",
  );
}

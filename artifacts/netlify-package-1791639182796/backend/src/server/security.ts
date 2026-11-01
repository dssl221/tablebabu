import { createHash, randomBytes } from "node:crypto";
import { parseCookie, stringifySetCookie } from "cookie";
import type { Request, Response, NextFunction } from "express";
import { db } from "./db";
import type { PlatformPrincipal } from "./access";
export const production = process.env.NODE_ENV === "production";
export const origin = process.env.APP_ORIGIN || "http://localhost:3000";
const originUrl = new URL(origin);
if (
  originUrl.origin !== origin ||
  !["http:", "https:"].includes(originUrl.protocol)
)
  throw new Error(
    "APP_ORIGIN must be an exact HTTP(S) origin without credentials, path, or trailing slash.",
  );
if (production && originUrl.protocol !== "https:")
  throw new Error("Production APP_ORIGIN must be HTTPS.");
export const validToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export const adminCookie = production ? "__Host-admin" : "admin";
export const sessionCookie = (slug: string) =>
  `${production ? "__Host-" : ""}guest-${slug}`;
export function setCookie(
  res: Response,
  name: string,
  value: string,
  maxAge: number,
) {
  res.append(
    "Set-Cookie",
    stringifySetCookie({
      name,
      value,
      httpOnly: true,
      secure: production,
      sameSite: "lax",
      path: "/",
      maxAge,
    }),
  );
}
export function cookies(header?: string) {
  return parseCookie(header || "");
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(
  value: unknown,
  status: number,
  message: string,
): asserts value {
  if (!value) throw new HttpError(status, message);
}
export async function authenticate(header?: string) {
  const raw = cookies(header)[adminCookie];
  if (!validToken(raw)) return null;
  const session = await db.authSession.findUnique({
    where: { tokenHash: hash(raw) },
    include: {
      user: {
        include: {
          restaurants: { orderBy: { createdAt: "asc" } },
          platformRole: true,
          restaurantAccess: true,
        },
      },
    },
  });
  return session && session.user.isActive && session.expiresAt > new Date()
    ? session
    : null;
}
export async function customer(
  header: string | undefined,
  slug: string,
  allowCompleted = false,
) {
  const raw = cookies(header)[sessionCookie(slug)];
  assert(validToken(raw), 401, "Please enter your name to start an order.");
  const session = await db.orderSession.findUnique({
    where: { sessionToken: hash(raw) },
    include: { restaurant: true },
  });
  assert(
    session &&
      session.restaurant.slug === slug &&
      session.expiresAt > new Date(),
    401,
    "Your session has expired. Please start again.",
  );
  assert(
    allowCompleted || session.status !== "COMPLETED",
    409,
    "This session is closed. Start a new visit.",
  );
  return session;
}
declare global {
  namespace Express {
    interface Request {
      restaurantId: string;
      userId: string;
      authId: string;
      platformPrincipal: PlatformPrincipal;
    }
  }
}
export async function admin(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = await authenticate(req.headers.cookie);
    assert(auth, 401, "Please sign in.");
    const selected = req.get("X-Restaurant-Id");
    const restaurant = selected
      ? auth.user.restaurants.find((r) => r.id === selected)
      : auth.user.restaurants[0];
    assert(restaurant, 403, "Restaurant access denied.");
    req.restaurantId = restaurant.id;
    req.userId = auth.userId;
    req.authId = auth.id;
    next();
  } catch (e) {
    next(e);
  }
}
export async function signedIn(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const auth = await authenticate(req.headers.cookie);
    assert(auth, 401, "Please sign in.");
    req.userId = auth.userId;
    req.authId = auth.id;
    next();
  } catch (error) {
    next(error);
  }
}
export async function platformAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const auth = await authenticate(req.headers.cookie);
    assert(auth, 401, "Please sign in.");
    assert(
      auth.user.role === "ADMIN",
      403,
      "Platform administrator access required.",
    );
    req.userId = auth.userId;
    req.authId = auth.id;
    next();
  } catch (error) {
    next(error);
  }
}

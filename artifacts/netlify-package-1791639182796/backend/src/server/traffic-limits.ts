import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { RequestHandler } from "express";
import { consumeLimit } from "./hardening";
import { customer, HttpError } from "./security";

const limit = (count: number) =>
  rateLimit({
    windowMs: 60000,
    limit: count,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please wait a minute." },
  });
const menu = limit(12000),
  health = limit(120),
  sessionReads = limit(12000),
  actions = limit(6000),
  general = limit(1200);
// Independent pools: shared Wi-Fi menu browsing cannot exhaust order/auth/health
// quotas. Auth retains its existing strict IP + PostgreSQL account throttles.
export const trafficLimits: RequestHandler = (req, res, next) => {
  if (req.path === "/health") return health(req, res, next);
  if (
    req.method === "GET" &&
    /^\/public\/restaurants\/[^/]+(?:\/menu)?$/.test(req.path)
  )
    return menu(req, res, next);
  if (req.method === "GET" && req.path.startsWith("/public/sessions/"))
    return sessionReads(req, res, next);
  if (
    req.method === "POST" &&
    ["/public/orders", "/public/service-requests"].includes(req.path)
  )
    return actions(req, res, next);
  // Session creation has dedicated contextual limits below.
  if (req.method === "POST" && req.path === "/public/sessions") return next();
  return general(req, res, next);
};
const creationIp = limit(1200);
export const sessionCreationLimit: RequestHandler = (req, res, next) =>
  creationIp(req, res, async (error) => {
    if (error) return next(error);
    try {
      const slug = req.body?.restaurantSlug;
      if (typeof slug !== "string" || slug.length > 80) return next();
      let guestId: string | undefined;
      try {
        guestId = (await customer(req.headers.cookie, slug, true)).id;
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
      }
      // A valid existing guest cookie gets its own tighter identity quota. New
      // browsers share a generous restaurant/IP allowance, never a claimed ID.
      const identity = guestId
        ? `guest:${guestId}:${slug}`
        : `${ipKeyGenerator(req.ip || "unknown")}:${slug}`;
      const quota = await consumeLimit(
        "session-create",
        identity,
        guestId ? 30 : 300,
        60000,
      );
      if (!quota.allowed) {
        res.set("Retry-After", String(quota.retryAfter));
        res
          .status(429)
          .json({ error: "Please wait before starting another visit." });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  });

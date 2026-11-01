import { randomBytes, randomUUID } from "node:crypto";
import type { RequestHandler, Response } from "express";
import type { ServerResponse } from "node:http";
import { hash, origin, production, HttpError } from "./security";
import { db } from "./db";

// PostgreSQL is shared by all application workers; restarting a worker does not
// reset abuse counters. Keys contain hashes, never email addresses or tokens.
export async function consumeLimit(
  scope: string,
  identity: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const start = Math.floor(now / windowMs) * windowMs;
  const key = `${scope}:${hash(identity)}`;
  const expiresAt = new Date(start + windowMs);
  // Prisma DateTime columns store UTC without a zone. Cast UTC strings explicitly
  // so a database configured in a local timezone cannot shift throttle expiry.
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "SecurityThrottle" ("key", "count", "expiresAt")
    VALUES (${key}, 1, ${expiresAt.toISOString()}::timestamp)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "SecurityThrottle"."expiresAt" <= ${new Date(now).toISOString()}::timestamp
        THEN 1 ELSE LEAST("SecurityThrottle"."count" + 1, ${limit + 1}) END,
      "expiresAt" = CASE WHEN "SecurityThrottle"."expiresAt" <= ${new Date(now).toISOString()}::timestamp
        THEN EXCLUDED."expiresAt" ELSE "SecurityThrottle"."expiresAt" END
    RETURNING "count"`;
  return {
    allowed: rows[0].count <= limit,
    retryAfter: Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
  };
}

export const accountLimit: RequestHandler = async (req, res, next) => {
  try {
    const email = req.body?.email;
    if (typeof email !== "string" || email.length > 254) return next();
    const result = await consumeLimit(
      "auth-account",
      email.trim().toLowerCase(),
      20,
      15 * 60000,
    );
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfter));
      res
        .status(429)
        .json({ error: "Too many sign-in attempts. Please try again later." });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

let activeUploads = 0;
export async function withUploadCapacity<T>(
  work: () => Promise<T>,
): Promise<T> {
  if (activeUploads >= 2)
    throw new HttpError(503, "Image processing is busy. Please retry shortly.");
  activeUploads++;
  try {
    return await work();
  } finally {
    activeUploads--;
  }
}

export const requestBoundary: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  res.set("X-Request-Id", requestId);
  res.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  // Overwrite untrusted incoming CSP; Next reads this header to nonce its scripts.
  res.locals.nonce = randomBytes(18).toString("base64");
  delete req.headers["content-security-policy"];
  delete req.headers["content-security-policy-report-only"];
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store");
    res.on("finish", () => {
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method) ||
        res.statusCode >= 400
      ) {
        console.info(
          JSON.stringify({
            event: "security.request",
            timestamp: new Date().toISOString(),
            requestId,
            method: req.method,
            route: req.route?.path || "unmatched",
            status: res.statusCode,
            userId: req.userId || null,
            restaurantId: req.restaurantId || null,
          }),
        );
      }
    });
    if (
      req.get("sec-fetch-site") === "cross-site" ||
      (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        req.get("origin") !== origin)
    ) {
      res.status(403).json({ error: "Request origin not allowed." });
      return;
    }
  }
  next();
};

export const nonceSource = (_req: unknown, res: ServerResponse) =>
  `'nonce-${(res as Response).locals.nonce}'`;
export const scriptSources = [
  "'self'",
  nonceSource,
  ...(production ? [] : ["'unsafe-eval'"]),
];

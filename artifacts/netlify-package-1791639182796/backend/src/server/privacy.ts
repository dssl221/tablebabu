import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "./db";
import { platformAdmin, hash, assert, HttpError } from "./security";
import { consumeLimit } from "./hardening";
const wrap =
  (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
const safeText = z
  .string()
  .trim()
  .min(10)
  .max(2000)
  .refine(
    (s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s),
    "Remove invalid control characters.",
  );
export const privacyRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  type: z.enum([
    "ACCESS",
    "CORRECTION",
    "ERASURE",
    "WITHDRAWAL",
    "NOMINATION",
    "GRIEVANCE",
  ]),
  details: safeText,
});
export function privacyRouter() {
  const router = express.Router();
  router.post(
    "/privacy/requests",
    rateLimit({
      windowMs: 3600000,
      limit: 10,
      message: {
        error:
          "Too many privacy requests. Please try later or email the grievance contact.",
      },
    }),
    wrap(async (req, res) => {
      const data = privacyRequestSchema.parse(req.body);
      const limit = await consumeLimit(
        "privacy-request",
        hash(data.email),
        5,
        3600000,
      );
      if (!limit.allowed) {
        res.set("Retry-After", String(limit.retryAfter));
        throw new HttpError(
          429,
          "Please wait before submitting another request, or email the grievance contact.",
        );
      }
      const request = await db.privacyRequest.create({
        data,
        select: { id: true },
      });
      res.status(201).json({ reference: request.id });
    }),
  );
  router.get(
    "/platform/privacy-requests",
    platformAdmin,
    wrap(async (req, res) => {
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(1)
        .parse(req.query.page);
      const [requests, total] = await db.$transaction([
        db.privacyRequest.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * 25,
          take: 25,
        }),
        db.privacyRequest.count(),
      ]);
      res.json({ requests, total, page });
    }),
  );
  router.patch(
    "/platform/privacy-requests/:id",
    platformAdmin,
    wrap(async (req, res) => {
      const id = z.string().max(60).parse(req.params.id);
      const data = z
        .object({
          version: z.number().int().nonnegative(),
          status: z.enum(["RECEIVED", "IN_REVIEW", "RESOLVED"]),
          resolution: z.string().trim().max(2000),
        })
        .parse(req.body);
      assert(
        data.status !== "RESOLVED" || data.resolution.length >= 10,
        422,
        "Record verification, action taken and the response before resolving.",
      );
      const result = await db.privacyRequest.updateMany({
        where: { id, version: data.version },
        data: {
          status: data.status,
          resolution: data.resolution,
          resolvedAt: data.status === "RESOLVED" ? new Date() : null,
          version: { increment: 1 },
        },
      });
      assert(
        result.count === 1,
        409,
        "The request changed or does not exist. Reload before updating.",
      );
      res.json({ ok: true });
    }),
  );
  return router;
}

import express from "express";
import { Prisma } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db, transaction } from "./db";
import {
  assert,
  cookies,
  hash,
  token,
  validToken,
  production,
  setCookie,
  platformAdmin,
} from "./security";
import { platformAccess } from "./access";
import { consumeLimit } from "./hardening";
import { enquirySchema, enquiryChangeSchema } from "../lib/enquiries";
const cookieName = production ? "__Host-enquiries" : "enquiries";
const accessSeconds = 30 * 86400;
const wrap =
  (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
const publicSelect = {
  id: true,
  hotelName: true,
  status: true,
  version: true,
  createdAt: true,
  assignedTo: { select: { name: true } },
  updates: {
    orderBy: { createdAt: "desc" as const },
    take: 20,
    select: { id: true, message: true, createdAt: true },
  },
};
function browserHash(req: express.Request) {
  const raw = cookies(req.headers.cookie)[cookieName];
  assert(
    validToken(raw),
    401,
    "Please reopen the contact form in this browser.",
  );
  return hash(raw);
}
export function enquiriesRouter() {
  const router = express.Router();
  const limit = rateLimit({
    windowMs: 3600000,
    limit: 20,
    message: {
      error: "Too many enquiries. Please try later or contact us directly.",
    },
  });
  router.post("/public/enquiries/session", limit, (req, res) => {
    const raw = cookies(req.headers.cookie)[cookieName];
    if (!validToken(raw)) setCookie(res, cookieName, token(), accessSeconds);
    res.json({ ok: true });
  });
  router.post(
    "/public/enquiries",
    limit,
    wrap(async (req, res) => {
      const input = enquirySchema.parse(req.body);
      const browserTokenHash = browserHash(req);
      const { website: _website, contactAllowed: _allowed, ...data } = input;
      const quota = await consumeLimit(
        "hotel-enquiry",
        hash(input.email),
        5,
        3600000,
      );
      assert(
        quota.allowed,
        429,
        "Please wait before sending another enquiry, or contact us directly.",
      );
      const request = await db.hotelEnquiry
        .upsert({
          where: {
            browserTokenHash_idempotencyKey: {
              browserTokenHash,
              idempotencyKey: data.idempotencyKey,
            },
          },
          create: {
            ...data,
            browserTokenHash,
            accessExpiresAt: new Date(Date.now() + accessSeconds * 1000),
          },
          update: {},
          select: { ...publicSelect, accessExpiresAt: true },
        })
        .catch(async (error) => {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
            return db.hotelEnquiry.findUniqueOrThrow({
              where: {
                browserTokenHash_idempotencyKey: {
                  browserTokenHash,
                  idempotencyKey: data.idempotencyKey,
                },
              },
              select: { ...publicSelect, accessExpiresAt: true },
            });
          throw error;
        });
      assert(
        request.accessExpiresAt > new Date(),
        401,
        "This enquiry tracker has expired. Please contact our team directly.",
      );
      const { accessExpiresAt: _expires, ...view } = request;
      const raw = cookies(req.headers.cookie)[cookieName];
      if (validToken(raw)) setCookie(res, cookieName, raw, accessSeconds);
      res.status(201).json(view);
    }),
  );
  router.get(
    "/public/enquiries",
    wrap(async (req, res) => {
      const raw = cookies(req.headers.cookie)[cookieName];
      if (!validToken(raw)) return res.json({ enquiries: [] });
      const enquiries = await db.hotelEnquiry.findMany({
        where: {
          browserTokenHash: hash(raw),
          accessExpiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: publicSelect,
      });
      res.json({ enquiries });
    }),
  );
  router.get(
    "/platform/enquiries/assignees",
    platformAdmin,
    wrap(async (_req, res) => {
      res.json({
        employees: await db.user.findMany({
          where: { isActive: true, role: { in: ["ADMIN", "STAFF"] } },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        }),
      });
    }),
  );
  router.get(
    "/platform/enquiries",
    platformAccess,
    wrap(async (req, res) => {
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(100000)
        .default(0)
        .parse(req.query.page);
      const search = z
        .string()
        .trim()
        .max(100)
        .default("")
        .parse(req.query.search);
      const status = z
        .enum(["NEW", "ASSIGNED", "CONTACTED", "CLOSED"])
        .optional()
        .parse(req.query.status);
      const where = {
        ...(req.platformPrincipal.isAdmin ? {} : { assignedToId: req.userId }),
        ...(status ? { status } : {}),
        OR: ["hotelName", "ownerName", "email", "city"].map((field) => ({
          [field]: { contains: search, mode: "insensitive" as const },
        })),
      };
      const [enquiries, total] = await Promise.all([
        db.hotelEnquiry.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: page * 25,
          take: 25,
          select: {
            ...publicSelect,
            ownerName: true,
            email: true,
            phone: true,
            city: true,
            message: true,
            assignedToId: true,
          },
        }),
        db.hotelEnquiry.count({ where }),
      ]);
      res.json({ enquiries, total, isAdmin: req.platformPrincipal.isAdmin });
    }),
  );
  router.patch(
    "/platform/enquiries/:id",
    platformAccess,
    wrap(async (req, res) => {
      const data = enquiryChangeSchema.parse(req.body);
      const id = z.string().max(100).parse(req.params.id);
      await transaction(async (tx) => {
        // Recheck access in the write transaction, including revocation and reassignment races.
        const auth = await tx.authSession.findUnique({
          where: { id: req.authId },
          include: { user: true },
        });
        assert(
          auth &&
            auth.expiresAt > new Date() &&
            auth.user.isActive &&
            ["ADMIN", "STAFF"].includes(auth.user.role),
          401,
          "Please sign in again.",
        );
        const isAdmin = auth.user.role === "ADMIN";
        const request = await tx.hotelEnquiry.findFirst({
          where: { id, ...(isAdmin ? {} : { assignedToId: req.userId }) },
        });
        assert(request, 404, "Enquiry not found.");
        assert(
          request.version === data.version,
          409,
          "This enquiry changed. Refresh before updating it.",
        );
        let assignedToId = request.assignedToId;
        let status = data.status || request.status;
        let message =
          status === "CONTACTED"
            ? "Our team has marked your request as contacted."
            : "Your enquiry has been closed. You can send a new message if you need more help.";
        if (data.assignedToId) {
          assert(
            isAdmin,
            403,
            "Only the main administrator can assign enquiries.",
          );
          const employee = await tx.user.findFirst({
            where: {
              id: data.assignedToId,
              isActive: true,
              role: { in: ["ADMIN", "STAFF"] },
            },
          });
          assert(employee, 422, "Choose an active platform team member.");
          if (
            request.assignedToId === employee.id &&
            request.status !== "CLOSED"
          )
            return;
          assignedToId = employee.id;
          status = "ASSIGNED";
          message = `${employee.name} has been assigned to your enquiry and will contact you shortly.`;
        } else {
          assert(
            request.status !== "CLOSED" && request.status !== status,
            409,
            "This status change is not available. Refresh the enquiry.",
          );
          if (status === "CONTACTED")
            assert(
              assignedToId,
              422,
              "Assign a team member before marking contacted.",
            );
        }
        const changed = await tx.hotelEnquiry.updateMany({
          where: { id, version: data.version },
          data: { assignedToId, status, version: { increment: 1 } },
        });
        assert(
          changed.count,
          409,
          "This enquiry changed. Refresh before updating it.",
        );
        await tx.enquiryUpdate.create({
          data: {
            enquiryId: id,
            actorId: req.userId,
            assignedToId,
            status,
            message,
          },
        });
      });
      res.json({ ok: true });
    }),
  );
  return router;
}

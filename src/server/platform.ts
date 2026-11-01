import express, { type Request } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import rateLimit from "express-rate-limit";
import multer from "multer";
import sharp from "sharp";
import type { Restaurant } from "@prisma/client";
import type { Server } from "socket.io";
import { db, transaction } from "./db";
import { admin, assert, HttpError } from "./security";
import { withUploadCapacity } from "./hardening";
import {
  platformAccess,
  restaurantScope,
  requirePermission,
  authorizePlatformWrite,
} from "./access";
import { employeeRouter } from "./employees";
import { textField } from "./domain";
import { subscriptionStatus, subscriptionDays } from "../lib/subscription";

export function subscriptionSummary(r: Restaurant) {
  return {
    restaurantId: r.id,
    onboardingStatus: r.onboardingStatus,
    name: r.name,
    status: subscriptionStatus(r),
    daysRemaining: subscriptionDays(r),
    frozen: r.platformFrozen,
    reason: r.platformFreezeReason,
    startsAt: r.subscriptionStartsAt,
    endsAt: r.subscriptionEndsAt,
    version: r.subscriptionVersion,
    upiId: r.subscriptionUpiId,
    payee: r.subscriptionPayee,
    amount: r.subscriptionAmount?.toString() || "",
    qrLocked: r.subscriptionQrLocked,
    qrUploaded: r.subscriptionQrUploaded,
    hasQr: r.subscriptionQrUploaded || !!r.subscriptionUpiId,
  };
}
function visibleSummary(req: Request, r: Restaurant) {
  const summary = subscriptionSummary(r);
  return req.platformPrincipal.permissions.includes("qr:manage")
    ? summary
    : { ...summary, upiId: "", payee: "", amount: "" };
}
async function qr(r: Restaurant) {
  if (r.subscriptionQrUploaded) {
    const image = await db.subscriptionQrImage.findUnique({
      where: { restaurantId: r.id },
    });
    assert(image, 404, "No subscription payment QR has been assigned.");
    return Buffer.from(image.png);
  }
  assert(
    r.subscriptionUpiId,
    404,
    "No subscription payment QR has been assigned.",
  );
  const params = new URLSearchParams({
    pa: r.subscriptionUpiId,
    pn: r.subscriptionPayee,
    cu: "INR",
    tn: `Subscription: ${r.name}`,
  });
  if (r.subscriptionAmount) params.set("am", r.subscriptionAmount.toFixed(2));
  return QRCode.toBuffer(`upi://pay?${params}`, {
    width: 360,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
export function ownerSubscriptionRouter() {
  const router = express.Router();
  router.use(admin);
  router.get("/", async (req, res) => {
    const r = await db.restaurant.findUniqueOrThrow({
      where: { id: req.restaurantId },
    });
    res.json(subscriptionSummary(r));
  });
  router.get("/qr", async (req, res) => {
    const r = await db.restaurant.findUniqueOrThrow({
      where: { id: req.restaurantId },
    });
    res.type("png").send(await qr(r));
  });
  return router;
}
export function platformRouter(io: Server) {
  const router = express.Router();
  router.use(platformAccess);
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      keyGenerator: (req) => req.userId,
      message: { error: "Too many requests. Please wait a minute." },
    }),
  );
  router.use("/employees", employeeRouter(io));
  router.get("/me", async (req, res) => {
    const user = await db.user.findUniqueOrThrow({
      where: { id: req.userId },
      select: { name: true, email: true },
    });
    res.json({
      ...user,
      isAdmin: req.platformPrincipal.isAdmin,
      permissions: req.platformPrincipal.permissions,
    });
  });
  router.get("/restaurants", async (req, res) => {
    const search = z.string().max(100).default("").parse(req.query.search);
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .default(0)
      .parse(req.query.page);
    const where = {
      ...restaurantScope(req),
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { slug: { contains: search, mode: "insensitive" as const } },
        {
          owner: { email: { contains: search, mode: "insensitive" as const } },
        },
      ],
    };
    const [rows, total] = await Promise.all([
      db.restaurant.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: page * 25,
        take: 25,
        include: { owner: { select: { name: true, email: true } } },
      }),
      db.restaurant.count({ where }),
    ]);
    res.json({
      total,
      page,
      restaurants: rows.map((r) => ({
        ...visibleSummary(req, r),
        slug: r.slug,
        owner: r.owner,
        onboardingStatus: r.onboardingStatus,
      })),
    });
  });
  router.get("/restaurants/:id", async (req, res) => {
    const r = await db.restaurant.findFirst({
      where: { AND: [{ id: String(req.params.id) }, restaurantScope(req)] },
      include: {
        owner: { select: { name: true, email: true } },
        subscriptionPayments: { orderBy: { createdAt: "desc" }, take: 20 },
        platformActions: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    assert(r, 404, "Restaurant not found.");
    const actors = await db.user.findMany({
      where: { id: { in: r.platformActions.map((action) => action.actorId) } },
      select: { id: true, name: true, email: true },
    });
    res.json({
      ...visibleSummary(req, r),
      slug: r.slug,
      owner: r.owner,
      payments: req.platformPrincipal.permissions.includes("payments:view")
        ? r.subscriptionPayments
        : [],
      actions: (req.platformPrincipal.permissions.includes("payments:view")
        ? r.platformActions
        : []
      ).map((action) => ({
        id: action.id,
        action: action.action,
        actorId: action.actorId,
        createdAt: action.createdAt,
        actorName:
          actors.find((actor) => actor.id === action.actorId)?.name ||
          "Former administrator",
      })),
    });
  });
  router.get("/restaurants/:id/qr", async (req, res) => {
    requirePermission(req, "qr:manage");
    const r = await db.restaurant.findFirst({
      where: { AND: [{ id: String(req.params.id) }, restaurantScope(req)] },
    });
    assert(r, 404, "Restaurant not found.");
    res.type("png").send(await qr(r));
  });
  const base = { version: z.number().int().min(0) };
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, parts: 2 },
  });
  router.post(
    "/restaurants/:id/qr/upload",
    (req, _res, next) => {
      assert(
        req.platformPrincipal.isAdmin,
        403,
        "Only a platform administrator can upload payment QRs.",
      );
      next();
    },
    rateLimit({
      windowMs: 60000,
      limit: 10,
      keyGenerator: (req) => req.userId,
    }),
    upload.single("image"),
    async (req, res) => {
      const version = z.coerce.number().int().min(0).parse(req.body.version);
      assert(req.file, 400, "Choose a QR image smaller than 5 MB.");
      const png = await withUploadCapacity(async () => {
        try {
          const image = sharp(req.file!.buffer, {
            limitInputPixels: 4_000_000,
          });
          const metadata = await image.metadata();
          assert(
            ["jpeg", "png", "webp"].includes(metadata.format || "") &&
              (metadata.pages || 1) === 1,
            400,
            "Use a static PNG, JPEG, or WebP image.",
          );
          const result = await image.rotate().png().toBuffer();
          assert(
            result.length <= 5 * 1024 * 1024,
            400,
            "QR image is too large.",
          );
          return result;
        } catch {
          throw new HttpError(
            400,
            "Use a valid static PNG, JPEG, or WebP QR image, up to 5 MB and 4 megapixels.",
          );
        }
      });
      const restaurantId = String(req.params.id);
      req.restaurantId = restaurantId;
      const result = await transaction(async (tx) => {
        await authorizePlatformWrite(tx, req, restaurantId, "qr:manage");
        const r = await tx.restaurant.findUnique({
          where: { id: restaurantId },
        });
        assert(r, 404, "Restaurant not found.");
        assert(
          r.subscriptionVersion === version,
          409,
          "This restaurant changed. Reload before saving.",
        );
        assert(
          !r.subscriptionQrLocked,
          409,
          "Unlock the QR before replacing it.",
        );
        await tx.subscriptionQrImage.upsert({
          where: { restaurantId },
          create: { restaurantId, png },
          update: { png },
        });
        await tx.platformAction.create({
          data: {
            restaurantId,
            actorId: req.userId,
            action: "qr-upload",
            details: { version, bytes: png.length, locked: true },
          },
        });
        return tx.restaurant.update({
          where: { id: restaurantId },
          data: {
            subscriptionQrUploaded: true,
            subscriptionQrLocked: true,
            subscriptionUpiId: "",
            subscriptionPayee: "",
            subscriptionAmount: null,
            subscriptionVersion: { increment: 1 },
          },
        });
      });
      io.to(`admin:${restaurantId}`).emit("subscription:updated");
      res.status(201).json(visibleSummary(req, result));
    },
  );
  const change = z.discriminatedUnion("action", [
    z.object({ ...base, action: z.literal("qr-lock"), locked: z.boolean() }),
    z.object({
      ...base,
      action: z.literal("freeze"),
      frozen: z.boolean(),
      reason: textField(300),
    }),
    z.object({
      ...base,
      action: z.literal("qr"),
      upiId: z
        .string()
        .trim()
        .max(100)
        .regex(/^$|^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9.-]{2,}$/),
      payee: textField(80),
      amount: z.number().positive().max(999999).multipleOf(0.01).nullable(),
    }),
    z.object({
      ...base,
      action: z.literal("payment"),
      idempotencyKey: z.string().uuid(),
      amount: z.number().positive().max(999999).multipleOf(0.01),
      reference: textField(120).pipe(z.string().min(2)),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      unfreeze: z.boolean(),
    }),
  ]);
  router.post("/restaurants/:id", async (req, res) => {
    const data = change.parse(req.body);
    const restaurantId = String(req.params.id);
    req.restaurantId = restaurantId;
    const result = await transaction(async (tx) => {
      await authorizePlatformWrite(
        tx,
        req,
        restaurantId,
        data.action === "freeze"
          ? "access:manage"
          : data.action === "qr" || data.action === "qr-lock"
            ? "qr:manage"
            : "payments:record",
      );
      if (data.action === "payment" && data.unfreeze)
        await authorizePlatformWrite(tx, req, restaurantId, "access:manage");
      const r = await tx.restaurant.findUnique({ where: { id: restaurantId } });
      assert(r, 404, "Restaurant not found.");
      if (data.action === "payment") {
        const previous = await tx.subscriptionPayment.findUnique({
          where: {
            restaurantId_idempotencyKey: {
              restaurantId,
              idempotencyKey: data.idempotencyKey,
            },
          },
        });
        if (previous) {
          assert(
            Number(previous.amount) === data.amount &&
              previous.reference === data.reference &&
              previous.startsAt.toISOString() === data.startsAt &&
              previous.endsAt.toISOString() === data.endsAt,
            409,
            "This payment submission was already used with different details.",
          );
          return r;
        }
        const duplicate = await tx.subscriptionPayment.findUnique({
          where: {
            restaurantId_reference: { restaurantId, reference: data.reference },
          },
        });
        assert(
          !duplicate,
          409,
          "This payment reference has already been recorded for this restaurant.",
        );
      }
      assert(
        r.subscriptionVersion === data.version,
        409,
        "This restaurant changed. Reload its details before saving.",
      );
      let update: Parameters<typeof tx.restaurant.update>[0]["data"] = {
        subscriptionVersion: { increment: 1 },
      };
      if (data.action === "freeze") {
        assert(
          !data.frozen || data.reason.length >= 2,
          400,
          "Enter the reason for freezing.",
        );
        update = {
          ...update,
          platformFrozen: data.frozen,
          platformFreezeReason: data.frozen ? data.reason : "",
        };
      } else if (data.action === "qr-lock") {
        assert(
          r.subscriptionQrUploaded || r.subscriptionUpiId,
          400,
          "Upload or generate a QR first.",
        );
        update = { ...update, subscriptionQrLocked: data.locked };
      } else if (data.action === "qr") {
        assert(
          !r.subscriptionQrLocked,
          409,
          "Unlock the QR before changing it.",
        );
        await tx.subscriptionQrImage.deleteMany({ where: { restaurantId } });
        assert(
          !data.upiId || data.payee.length >= 2,
          400,
          "Enter the payment recipient name.",
        );
        update = {
          ...update,
          subscriptionUpiId: data.upiId,
          subscriptionPayee: data.upiId ? data.payee : "",
          subscriptionAmount: data.upiId ? data.amount : null,
          subscriptionQrUploaded: false,
          subscriptionQrLocked: !!data.upiId,
        };
      } else {
        const startsAt = new Date(data.startsAt),
          endsAt = new Date(data.endsAt);
        assert(
          endsAt > startsAt &&
            endsAt.getTime() - startsAt.getTime() <= 3660 * 86400000,
          400,
          "Choose a valid subscription period of up to 10 years.",
        );
        await tx.subscriptionPayment.create({
          data: {
            restaurantId,
            recordedById: req.userId,
            idempotencyKey: data.idempotencyKey,
            amount: data.amount,
            reference: data.reference,
            startsAt,
            endsAt,
          },
        });
        update = {
          ...update,
          subscriptionStartsAt: startsAt,
          subscriptionEndsAt: endsAt,
          ...(data.unfreeze
            ? { platformFrozen: false, platformFreezeReason: "" }
            : {}),
        };
      }
      await tx.platformAction.create({
        data: {
          restaurantId,
          actorId: req.userId,
          action: data.action,
          details: JSON.parse(
            JSON.stringify({ before: subscriptionSummary(r), change: data }),
          ),
        },
      });
      return tx.restaurant.update({
        where: { id: restaurantId },
        data: update,
      });
    });
    io.to(`admin:${restaurantId}`).emit("subscription:updated");
    io.to(`menu:${restaurantId}`).emit("menu:updated");
    res.json(visibleSummary(req, result));
  });
  return router;
}

import express, { type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma, type OrderStatus, type Restaurant } from "@prisma/client";
import rateLimit from "express-rate-limit";
import multer from "multer";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { restaurantQR } from "./qr-design";
import {
  qrCustomizationSchema,
  isQRColor,
  isQRTemplate,
} from "../lib/qr-design";
import type { Server } from "socket.io";
import { db, transaction } from "./db";
import { placeOrder } from "./order-placement";
import { databaseFailure } from "./order-placement";
import { sessionTransaction } from "./session-transaction";
import { trafficLimits, sessionCreationLimit } from "./traffic-limits";
import { accountLimit, consumeLimit, withUploadCapacity } from "./hardening";
import { endLoginActivities } from "./login-activity";
import { IST } from "../lib/time";
import { onboardingRouter, onboardingScope } from "./onboarding";
import { enquiriesRouter } from "./enquiries";
import { privacyRouter } from "./privacy";
import { cmsRouter } from "./cms";
import { platformRouter, ownerSubscriptionRouter } from "./platform";
import { subscriptionAllowsOrders } from "../lib/subscription";
import { passwordSchema } from "../lib/onboarding";
import { renderReceipt } from "./receipt";
import { paymentBreakdown } from "./payment-analytics";
import {
  localDateKey,
  reportPeriod,
  transactionPdf,
} from "./transaction-report";
import {
  admin,
  signedIn,
  platformAdmin,
  assert,
  authenticate,
  cookies,
  customer,
  hash,
  HttpError,
  origin,
  adminCookie,
  sessionCookie,
  setCookie,
  token,
} from "./security";
import {
  customerNameSchema,
  isOpen,
  itemSchema,
  orderSchema,
  settingsSchema,
  textField,
  transitions,
} from "./domain";

const ordersInclude = {
  items: true,
  orderSession: { select: { id: true, customerName: true, status: true } },
};
const sessionInclude = {
  orders: { include: { items: true }, orderBy: { createdAt: "asc" as const } },
  serviceRequests: true,
};
const safeSession = (
  s: Prisma.OrderSessionGetPayload<{ include: typeof sessionInclude }>,
) => {
  const { sessionToken: _token, receiptHtml: _receipt, ...safe } = s;
  return {
    ...safe,
    total: s.orders
      .filter((o) => o.status !== "CANCELLED")
      .reduce((n, o) => n + Number(o.subtotal), 0),
  };
};
const safeRestaurant = (r: Restaurant) => {
  const {
    ownerId: _owner,
    subscriptionUpiId: _upi,
    subscriptionQrUploaded: _qrUploaded,
    subscriptionQrLocked: _qrLocked,
    subscriptionPayee: _payee,
    subscriptionAmount: _amount,
    subscriptionStartsAt: _starts,
    subscriptionEndsAt: _ends,
    subscriptionVersion: _version,
    platformFrozen: _frozen,
    platformFreezeReason: _reason,
    ...safe
  } = r;
  return {
    ...safe,
    orderingOpen: isOpen(r),
    orderingSuspended: !subscriptionAllowsOrders(r),
  };
};
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
// Zod defaults are useful on create, but omitted PATCH fields must stay unchanged.
const suppliedFields = <T extends object>(parsed: T, raw: object): T =>
  Object.fromEntries(
    Object.entries(parsed).filter(([key]) => Object.hasOwn(raw, key)),
  ) as T;

export function createApi(io: Server) {
  const api = express.Router();
  api.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  api.use(trafficLimits);
  api.use((req, _res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== origin
    )
      return next(new HttpError(403, "Request origin not allowed."));
    next();
  });
  const notify = (
    restaurantId: string,
    sessionId: string,
    event: string,
    payload: unknown,
  ) =>
    io
      .to(`admin:${restaurantId}`)
      .to(`session:${sessionId}`)
      .emit(event, payload);
  const menuChanged = (restaurantId: string) =>
    io
      .to(`menu:${restaurantId}`)
      .to(`admin:${restaurantId}`)
      .emit("menu:updated");

  api.use(enquiriesRouter());
  api.use(privacyRouter());
  api.use(cmsRouter());
  api.use("/platform", platformRouter(io));
  api.use("/subscription", ownerSubscriptionRouter());
  api.use(onboardingRouter());

  api.get(
    "/health",
    wrap(async (_req, res) => {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: "ok" });
    }),
  );
  api.post(
    "/auth/login",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 15,
      skipSuccessfulRequests: true,
      message: { error: "Too many login attempts. Try again in 15 minutes." },
    }),
    accountLimit,
    wrap(async (req, res) => {
      const data = z
        .object({
          email: z
            .string()
            .email()
            .max(254)
            .transform((s) => s.toLowerCase()),
          password: z
            .string()
            .min(1)
            .max(128)
            .refine(
              (value) => Buffer.byteLength(value, "utf8") <= 72,
              "Password is too long.",
            ),
        })
        .parse(req.body);
      const user = await db.user.findUnique({ where: { email: data.email } });
      const valid = await bcrypt.compare(
        data.password,
        user?.passwordHash ||
          "$2b$12$C6UzMDM.H6dfI/f/IKcEe.8KpRw8R0HkSvkRGDfMBNiEpGy/xT4rK",
      );
      assert(
        user && user.isActive && valid,
        401,
        "Email or password is incorrect.",
      );
      const previous = await authenticate(req.headers.cookie);
      const raw = token();
      await transaction(async (tx) => {
        // A password change racing with bcrypt verification must not create
        // a new session using credentials that have just been revoked.
        const current = await tx.user.findUnique({ where: { id: user.id } });
        assert(
          current?.isActive && current.passwordHash === user.passwordHash,
          401,
          "Email or password is incorrect.",
        );
        const createdSession = await tx.authSession.create({
          data: {
            userId: user.id,
            tokenHash: hash(raw),
            expiresAt: new Date(Date.now() + 12 * 3600000),
          },
        });
        await tx.loginActivity.create({
          data: {
            userId: user.id,
            authSessionId: createdSession.id,
            signedInAt: createdSession.createdAt,
            expiresAt: createdSession.expiresAt,
          },
        });
        if (previous) {
          await endLoginActivities(tx, [previous.id], "ROTATED");
          await tx.authSession.deleteMany({ where: { id: previous.id } });
        }
      });
      if (previous) {
        io.in(`auth:${previous.id}`).disconnectSockets(true);
      }
      req.userId = user.id;
      setCookie(res, adminCookie, raw, 12 * 3600);
      const restaurant = await db.restaurant.findFirst({
        where: { ownerId: user.id },
        orderBy: { createdAt: "asc" },
        select: { onboardingStatus: true },
      });
      res.json({
        ok: true,
        redirectTo: ["ADMIN", "STAFF"].includes(user.role)
          ? "/control-room"
          : restaurant?.onboardingStatus === "DRAFT"
            ? "/onboarding"
            : "/dashboard",
      });
    }),
  );
  api.post(
    "/auth/logout",
    wrap(async (req, res) => {
      const raw = cookies(req.headers.cookie)[adminCookie];
      if (raw) {
        const auth = await db.authSession.findUnique({
          where: { tokenHash: hash(raw) },
        });
        if (auth) {
          await transaction(async (tx) => {
            await endLoginActivities(tx, [auth.id], "LOGOUT");
            await tx.authSession.deleteMany({ where: { id: auth.id } });
          });
          io.in(`auth:${auth.id}`).disconnectSockets(true);
        }
      }
      setCookie(res, adminCookie, "", 0);
      res.json({ ok: true });
    }),
  );
  api.get(
    "/auth/me",
    admin,
    wrap(async (req, res) => {
      const user = await db.user.findUniqueOrThrow({
        where: { id: req.userId },
        select: { name: true, email: true },
      });
      const restaurant = await db.restaurant.findUniqueOrThrow({
        where: { id: req.restaurantId },
      });
      res.json({ user, restaurant: safeRestaurant(restaurant) });
    }),
  );
  api.post(
    "/auth/password",
    signedIn,
    platformAdmin,
    wrap(async (req, res) => {
      const quota = await consumeLimit(
        "password-change",
        req.userId,
        5,
        15 * 60000,
      );
      if (!quota.allowed) res.set("Retry-After", String(quota.retryAfter));
      assert(quota.allowed, 429, "Too many attempts. Please try again later.");
      const data = z
        .object({
          currentPassword: z
            .string()
            .min(1)
            .max(72)
            .refine(
              (value) => Buffer.byteLength(value, "utf8") <= 72,
              "Password is too long.",
            ),
          newPassword: passwordSchema,
        })
        .parse(req.body);
      const user = await db.user.findUniqueOrThrow({
        where: { id: req.userId },
      });
      assert(
        await bcrypt.compare(data.currentPassword, user.passwordHash),
        401,
        "Your current password is incorrect.",
      );
      assert(
        data.currentPassword !== data.newPassword,
        400,
        "Choose a different new password.",
      );
      const passwordHash = await bcrypt.hash(data.newPassword, 12);
      const revoked = await transaction(async (tx) => {
        const active = await tx.authSession.findFirst({
          where: {
            id: req.authId,
            userId: req.userId,
            expiresAt: { gt: new Date() },
          },
        });
        assert(active, 401, "Please sign in again.");
        const updated = await tx.user.updateMany({
          where: { id: req.userId, passwordHash: user.passwordHash },
          data: { passwordHash },
        });
        assert(
          updated.count === 1,
          409,
          "Your credentials changed. Please sign in again.",
        );
        const sessions = await tx.authSession.findMany({
          where: { userId: req.userId },
          select: { id: true },
        });
        await endLoginActivities(
          tx,
          sessions.map((s) => s.id),
          "PASSWORD_CHANGED",
        );
        await tx.authSession.deleteMany({ where: { userId: req.userId } });
        return sessions;
      });
      for (const session of revoked)
        io.in(`auth:${session.id}`).disconnectSockets(true);
      setCookie(res, adminCookie, "", 0);
      res.json({ ok: true });
    }),
  );
  api.get(
    "/public/restaurants/:slug",
    wrap(async (req, res) => {
      const r = await db.restaurant.findUnique({
        where: { slug: String(req.params.slug) },
      });
      assert(
        r && r.isActive && r.onboardingStatus === "LIVE",
        404,
        "Restaurant not found.",
      );
      res.json(safeRestaurant(r));
    }),
  );
  api.get(
    "/public/restaurants/:slug/menu",
    wrap(async (req, res) => {
      const r = await db.restaurant.findUnique({
        where: { slug: String(req.params.slug) },
      });
      assert(
        r && r.isActive && r.onboardingStatus === "LIVE",
        404,
        "Restaurant not found.",
      );
      const categories = await db.menuCategory.findMany({
        where: { restaurantId: r.id, isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        },
      });
      res.json({ restaurant: safeRestaurant(r), categories });
    }),
  );
  api.post(
    "/public/sessions",
    sessionCreationLimit,
    wrap(async (req, res) => {
      const data = z
        .object({
          restaurantSlug: z.string().min(1).max(80),
          customerName: customerNameSchema,
        })
        .parse(req.body);
      const r = await db.restaurant.findUnique({
        where: { slug: data.restaurantSlug },
      });
      assert(
        r && r.isActive && r.onboardingStatus === "LIVE",
        404,
        "Restaurant not found.",
      );
      assert(
        subscriptionAllowsOrders(r),
        403,
        "Online ordering is temporarily unavailable. Please contact the restaurant.",
      );
      let existing;
      try {
        existing = await customer(req.headers.cookie, r.slug);
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
      }
      // A settled visit remains available to staff for closing, but must not
      // trap this browser in a session that can no longer accept orders.
      if (existing && !existing.paidAt)
        return res.json(
          safeSession(
            await db.orderSession.findUniqueOrThrow({
              where: { id: existing.id },
              include: sessionInclude,
            }),
          ),
        );
      const raw = token();
      const s = await db.orderSession.create({
        data: {
          restaurantId: r.id,
          customerName: data.customerName,
          sessionToken: hash(raw),
          expiresAt: new Date(Date.now() + 24 * 3600000),
        },
        include: sessionInclude,
      });
      setCookie(res, sessionCookie(r.slug), raw, 24 * 3600);
      res.status(201).json(safeSession(s));
    }),
  );
  // Use "current" instead of placing bearer secrets into a URL or browser history.
  api.get(
    "/public/sessions/current/export",
    wrap(async (req, res) => {
      const slug = z.string().min(1).max(80).parse(req.query.slug);
      const session = await customer(req.headers.cookie, slug, true);
      const visit = await db.orderSession.findFirstOrThrow({
        where: { id: session.id, restaurantId: session.restaurantId },
        select: {
          customerName: true,
          status: true,
          openedAt: true,
          closedAt: true,
          paymentMethod: true,
          paidAt: true,
          serviceRequests: {
            select: { type: true, status: true, createdAt: true },
          },
          orders: {
            select: {
              orderNumber: true,
              status: true,
              subtotal: true,
              customerNote: true,
              createdAt: true,
              items: {
                select: {
                  itemNameSnapshot: true,
                  priceSnapshot: true,
                  quantity: true,
                  notes: true,
                  total: true,
                },
              },
            },
          },
        },
      });
      res.set(
        "Content-Disposition",
        'attachment; filename="my-restaurant-visit.json"',
      );
      res.json({
        exportedAt: new Date(),
        restaurant: session.restaurant.name,
        visit,
        scope:
          "This browser's authenticated visit only. For other records, correction, withdrawal, nomination or erasure, use /legal/contact. This export does not cancel orders or delete retained records.",
      });
    }),
  );
  api.get(
    "/public/sessions/current/receipt",
    wrap(async (req, res) => {
      const slug = z.string().min(1).max(80).parse(req.query.slug);
      const session = await customer(req.headers.cookie, slug, true);
      const s = await db.orderSession.findUniqueOrThrow({
        where: { id: session.id, restaurantId: session.restaurantId },
        include: sessionInclude,
      });
      assert(
        s.paidAt,
        409,
        "Your receipt will be available once the restaurant confirms payment.",
      );
      res.set(
        "Content-Disposition",
        'attachment; filename="payment-receipt.html"',
      );
      res.set(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      );
      res
        .type("html")
        .send(s.receiptHtml || renderReceipt(session.restaurant, s, s.paidAt));
    }),
  );
  api.get(
    "/public/sessions/:token",
    wrap(async (req, res) => {
      assert(
        req.params.token === "current",
        400,
        "Use /sessions/current with your session cookie.",
      );
      const slug = z.string().min(1).parse(req.query.slug);
      const s = await customer(req.headers.cookie, slug, true);
      res.json(
        safeSession(
          await db.orderSession.findUniqueOrThrow({
            where: { id: s.id },
            include: sessionInclude,
          }),
        ),
      );
    }),
  );
  api.post(
    "/public/orders",
    wrap(async (req, res) => {
      const data = orderSchema.parse(req.body);
      const session = await customer(req.headers.cookie, data.restaurantSlug);
      const quota = await consumeLimit("order-session", session.id, 20, 60000);
      if (!quota.allowed) res.set("Retry-After", String(quota.retryAfter));
      assert(
        quota.allowed,
        429,
        "Too many order attempts. Please wait a minute.",
      );
      const requestHash = hash(
        JSON.stringify({
          items: [...data.items].sort((a, b) =>
            a.menuItemId.localeCompare(b.menuItemId),
          ),
          customerNote: data.customerNote || "",
        }),
      );
      const result = await placeOrder(
        data,
        session,
        requestHash,
        String(res.getHeader("X-Request-Id")),
      );
      if (result.created)
        notify(session.restaurantId, session.id, "order:new", result.order);
      res.status(result.created ? 201 : 200).json(result.order);
    }),
  );
  api.post(
    "/public/service-requests",
    wrap(async (req, res) => {
      const data = z
        .object({
          restaurantSlug: z.string(),
          type: z.enum(["REQUEST_BILL", "NEED_HELP"]),
          paymentMethod: z.enum(["UPI", "CASH"]).optional(),
        })
        .refine(
          (data) => data.type !== "REQUEST_BILL" || !!data.paymentMethod,
          {
            message: "Choose UPI or Cash before requesting your bill.",
            path: ["paymentMethod"],
          },
        )
        .parse(req.body);
      const session = await customer(req.headers.cookie, data.restaurantSlug);
      const quota = await consumeLimit(
        "service-session",
        session.id,
        10,
        60000,
      );
      if (!quota.allowed) res.set("Retry-After", String(quota.retryAfter));
      assert(
        quota.allowed,
        429,
        "Too many service requests. Please wait a minute.",
      );
      const request = await sessionTransaction(
        session.restaurantId,
        session.id,
        String(res.getHeader("X-Request-Id")),
        async (tx) => {
          const fresh = await tx.orderSession.findUniqueOrThrow({
            where: { id: session.id },
          });
          assert(fresh.status !== "COMPLETED", 409, "Session is closed.");
          assert(
            !fresh.paidAt,
            409,
            "Payment has already been received for this visit.",
          );
          const previous = await tx.serviceRequest.findFirst({
            where: {
              restaurantId: session.restaurantId,
              orderSessionId: session.id,
              type: data.type,
              status: { not: "COMPLETED" },
            },
          });
          if (data.type === "REQUEST_BILL") {
            const count = await tx.order.count({
              where: {
                orderSessionId: session.id,
                status: { not: "CANCELLED" },
              },
            });
            assert(
              count > 0,
              409,
              "Place an order before requesting your bill.",
            );
            await tx.orderSession.update({
              where: { id: session.id },
              data: {
                status: "BILL_REQUESTED",
                paymentMethod: data.paymentMethod,
              },
            });
          }
          if (previous) return previous;
          return tx.serviceRequest.create({
            data: {
              restaurantId: session.restaurantId,
              orderSessionId: session.id,
              type: data.type,
            },
          });
        },
      );
      notify(
        session.restaurantId,
        session.id,
        data.type === "REQUEST_BILL" ? "service:bill" : "service:help",
        request,
      );
      res.json(request);
    }),
  );

  api.use((req, res, next) => {
    if (
      ["/uploads", "/qr"].includes(req.path) &&
      (req.headers["x-onboarding-restaurant"] || req.query.onboardingRestaurant)
    ) {
      return platformAdmin(req, res, (error) =>
        error ? next(error) : onboardingScope(req, res, next),
      );
    }
    return admin(req, res, next);
  });
  api.use(async (req, _res, next) => {
    try {
      if (["/uploads", "/qr"].includes(req.path)) return next();
      const restaurant = await db.restaurant.findUniqueOrThrow({
        where: { id: req.restaurantId },
        select: { onboardingStatus: true },
      });
      assert(
        restaurant.onboardingStatus === "LIVE",
        409,
        "Your restaurant is being set up by TableBabu. Contact our team for an update.",
      );
      next();
    } catch (error) {
      next(error);
    }
  });
  api.get(
    "/restaurant",
    wrap(async (req, res) => {
      res.json(
        safeRestaurant(
          await db.restaurant.findUniqueOrThrow({
            where: { id: req.restaurantId },
          }),
        ),
      );
    }),
  );
  api.patch(
    "/restaurant",
    wrap(async (req, res) => {
      const r = await db.restaurant.update({
        where: { id: req.restaurantId },
        data: settingsSchema.parse(req.body),
      });
      menuChanged(r.id);
      res.json(safeRestaurant(r));
    }),
  );
  api.get(
    "/menu",
    wrap(async (req, res) => {
      res.json(
        await db.menuCategory.findMany({
          where: { restaurantId: req.restaurantId },
          orderBy: { sortOrder: "asc" },
          include: {
            items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
          },
        }),
      );
    }),
  );
  const categorySchema = z.object({
    name: textField(60).pipe(z.string().min(2)),
    description: textField(200).default(""),
    sortOrder: z.number().int().min(0).max(10000).default(0),
    isActive: z.boolean().default(true),
  });
  api.post(
    "/menu/categories",
    wrap(async (req, res) => {
      const category = await db.menuCategory.create({
        data: {
          ...categorySchema.parse(req.body),
          restaurantId: req.restaurantId,
        },
      });
      menuChanged(req.restaurantId);
      res.status(201).json(category);
    }),
  );
  api.patch(
    "/menu/categories/:id",
    wrap(async (req, res) => {
      const updated = await db.menuCategory.updateMany({
        where: { id: String(req.params.id), restaurantId: req.restaurantId },
        data: suppliedFields(
          categorySchema.partial().parse(req.body),
          req.body,
        ),
      });
      assert(updated.count, 404, "Category not found.");
      menuChanged(req.restaurantId);
      res.json({ ok: true });
    }),
  );
  api.post(
    "/menu/items",
    wrap(async (req, res) => {
      const data = itemSchema.parse(req.body);
      assert(
        await db.menuCategory.findFirst({
          where: { id: data.categoryId, restaurantId: req.restaurantId },
        }),
        404,
        "Category not found.",
      );
      const item = await db.menuItem.create({
        data: { ...data, restaurantId: req.restaurantId },
      });
      menuChanged(req.restaurantId);
      res.status(201).json(item);
    }),
  );
  api.post(
    "/menu/items/reorder",
    wrap(async (req, res) => {
      const data = z
        .object({
          categoryId: z.string().min(1),
          itemIds: z.array(z.string()).min(1).max(500),
        })
        .parse(req.body);
      await transaction(async (tx) => {
        const items = await tx.menuItem.findMany({
          where: {
            categoryId: data.categoryId,
            restaurantId: req.restaurantId,
          },
          select: { id: true },
        });
        assert(
          items.length === data.itemIds.length &&
            new Set(data.itemIds).size === items.length &&
            items.every((i) => data.itemIds.includes(i.id)),
          409,
          "The menu changed. Refresh before reordering.",
        );
        for (const [sortOrder, id] of data.itemIds.entries())
          await tx.menuItem.updateMany({
            where: { id, restaurantId: req.restaurantId },
            data: { sortOrder },
          });
      });
      menuChanged(req.restaurantId);
      res.json({ ok: true });
    }),
  );
  api.patch(
    "/menu/items/:id",
    wrap(async (req, res) => {
      const data = suppliedFields(
        itemSchema.partial().parse(req.body),
        req.body,
      );
      if (data.categoryId)
        assert(
          await db.menuCategory.findFirst({
            where: { id: data.categoryId, restaurantId: req.restaurantId },
          }),
          404,
          "Category not found.",
        );
      const updated = await db.menuItem.updateMany({
        where: { id: String(req.params.id), restaurantId: req.restaurantId },
        data,
      });
      assert(updated.count, 404, "Dish not found.");
      menuChanged(req.restaurantId);
      res.json({ ok: true });
    }),
  );
  api.patch(
    "/menu/items/:id/availability",
    wrap(async (req, res) => {
      const data = z.object({ isAvailable: z.boolean() }).parse(req.body);
      const updated = await db.menuItem.updateMany({
        where: { id: String(req.params.id), restaurantId: req.restaurantId },
        data,
      });
      assert(updated.count, 404, "Dish not found.");
      menuChanged(req.restaurantId);
      res.json({ ok: true });
    }),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    fileFilter: (_req, file, callback) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
        return callback(new HttpError(400, "Use a JPEG, PNG, or WebP image."));
      callback(null, true);
    },
  });
  api.post(
    "/uploads",
    rateLimit({
      windowMs: 60000,
      limit: 10,
      keyGenerator: (req) => req.userId,
      message: { error: "Too many uploads. Please wait a minute." },
    }),
    upload.single("image"),
    wrap(async (req, res) => {
      assert(req.file, 400, "Choose an image smaller than 5 MB.");
      const image = req.file.buffer;
      const buffer = await withUploadCapacity(async () => {
        try {
          const metadata = await sharp(image, {
            limitInputPixels: 25_000_000,
          }).metadata();
          assert(
            ["jpeg", "png", "webp"].includes(metadata.format || "") &&
              (metadata.pages || 1) === 1,
            400,
            "Use a static JPEG, PNG, or WebP image.",
          );
          return await sharp(image, { limitInputPixels: 25_000_000 })
            .rotate()
            .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer();
        } catch {
          throw new HttpError(400, "Use a valid JPEG, PNG, or WebP image.");
        }
      });
      const directory = path.join(process.cwd(), "uploads", req.restaurantId);
      await mkdir(directory, { recursive: true });
      const filename = `${token()}.webp`;
      await writeFile(path.join(directory, filename), buffer);
      res.status(201).json({ url: `/uploads/${req.restaurantId}/${filename}` });
    }),
  );
  api.get(
    "/orders",
    wrap(async (req, res) => {
      const page = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(0)
        .parse(req.query.page);
      const where: Prisma.OrderWhereInput = { restaurantId: req.restaurantId };
      if (req.query.active === "true")
        where.status = { notIn: ["COMPLETED", "CANCELLED"] };
      const [orders, total] = await Promise.all([
        db.order.findMany({
          where,
          include: ordersInclude,
          orderBy: { createdAt: "desc" },
          take: req.query.active === "true" ? undefined : 100,
          skip: req.query.active === "true" ? 0 : page * 100,
        }),
        db.order.count({ where }),
      ]);
      res.json({ orders, total });
    }),
  );
  api.patch(
    "/orders/:id/status",
    wrap(async (req, res) => {
      const { status } = z
        .object({
          status: z.enum([
            "ACCEPTED",
            "PREPARING",
            "READY",
            "SERVED",
            "COMPLETED",
            "CANCELLED",
          ]),
        })
        .parse(req.body);
      const order = await transaction(async (tx) => {
        const o = await tx.order.findFirst({
          where: { id: String(req.params.id), restaurantId: req.restaurantId },
        });
        assert(o, 404, "Order not found.");
        const s = await tx.orderSession.findFirstOrThrow({
          where: { id: o.orderSessionId, restaurantId: req.restaurantId },
        });
        assert(
          !s.paidAt && s.status !== "COMPLETED",
          409,
          "The bill is settled; this order is locked.",
        );
        if (o.status !== status)
          assert(
            transitions[o.status].includes(status),
            409,
            "The order has changed. Refresh and try again.",
          );
        return tx.order.update({
          where: { id: o.id, restaurantId: req.restaurantId },
          data: { status: status as OrderStatus },
          include: ordersInclude,
        });
      });
      notify(
        req.restaurantId,
        order.orderSessionId,
        `order:${status.toLowerCase()}`,
        order,
      );
      res.json(order);
    }),
  );
  api.get(
    "/sessions",
    wrap(async (req, res) => {
      const sessions = await db.orderSession.findMany({
        where: {
          restaurantId: req.restaurantId,
          status: { not: "COMPLETED" },
          OR: [{ expiresAt: { gt: new Date() } }, { orders: { some: {} } }],
        },
        orderBy: { openedAt: "desc" },
        include: sessionInclude,
      });
      res.json(sessions.map(safeSession));
    }),
  );
  api.get(
    "/sessions/:id",
    wrap(async (req, res) => {
      const s = await db.orderSession.findFirst({
        where: { id: String(req.params.id), restaurantId: req.restaurantId },
        include: sessionInclude,
      });
      assert(s, 404, "Session not found.");
      res.json(safeSession(s));
    }),
  );
  api.post(
    "/sessions/:id/paid",
    wrap(async (req, res) => {
      const s = await transaction(async (tx) => {
        const s = await tx.orderSession.findFirst({
          where: { id: String(req.params.id), restaurantId: req.restaurantId },
          include: {
            orders: { include: { items: true }, orderBy: { createdAt: "asc" } },
          },
        });
        assert(s && s.status !== "COMPLETED", 404, "Active session not found.");
        assert(
          s.orders.length > 0 &&
            s.orders.every((o) =>
              ["COMPLETED", "CANCELLED"].includes(o.status),
            ),
          409,
          "Complete or cancel every order before settling the bill.",
        );
        const paidAt = s.paidAt || new Date();
        const restaurant = await tx.restaurant.findUniqueOrThrow({
          where: { id: req.restaurantId },
        });
        return tx.orderSession.update({
          where: { id: s.id, restaurantId: req.restaurantId },
          data: {
            paidAt,
            status: "BILL_REQUESTED",
            receiptHtml: s.receiptHtml || renderReceipt(restaurant, s, paidAt),
          },
          include: sessionInclude,
        });
      });
      notify(req.restaurantId, s.id, "session:updated", { id: s.id });
      res.json(safeSession(s));
    }),
  );
  api.post(
    "/sessions/:id/close",
    wrap(async (req, res) => {
      const s = await transaction(async (tx) => {
        const s = await tx.orderSession.findFirst({
          where: { id: String(req.params.id), restaurantId: req.restaurantId },
          include: { orders: true },
        });
        assert(s, 404, "Session not found.");
        assert(
          s.paidAt || s.orders.every((o) => o.status === "CANCELLED"),
          409,
          "Mark the bill paid at the counter before closing.",
        );
        assert(
          s.orders.every((o) => ["COMPLETED", "CANCELLED"].includes(o.status)),
          409,
          "There are unfinished orders.",
        );
        await tx.serviceRequest.updateMany({
          where: { orderSessionId: s.id, restaurantId: req.restaurantId },
          data: { status: "COMPLETED" },
        });
        return tx.orderSession.update({
          where: { id: s.id, restaurantId: req.restaurantId },
          data: { status: "COMPLETED", closedAt: s.closedAt || new Date() },
          include: sessionInclude,
        });
      });
      notify(req.restaurantId, s.id, "session:updated", { id: s.id });
      res.json(safeSession(s));
    }),
  );
  api.patch(
    "/service-requests/:id",
    wrap(async (req, res) => {
      const { status } = z
        .object({ status: z.enum(["ACKNOWLEDGED", "COMPLETED"]) })
        .parse(req.body);
      const request = await db.serviceRequest.findFirst({
        where: { id: String(req.params.id), restaurantId: req.restaurantId },
      });
      assert(request, 404, "Request not found.");
      await db.serviceRequest.updateMany({
        where: { id: request.id, restaurantId: req.restaurantId },
        data: { status },
      });
      notify(req.restaurantId, request.orderSessionId, "session:updated", {
        id: request.orderSessionId,
      });
      res.json({ ok: true });
    }),
  );
  api.get(
    "/analytics",
    wrap(async (req, res) => {
      const days = z.enum(["1", "7", "30"]).default("1").parse(req.query.days);
      const r = await db.restaurant.findUniqueOrThrow({
        where: { id: req.restaurantId },
      });
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: IST,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const cutoff = new Date(`${today}T00:00:00Z`);
      cutoff.setUTCDate(cutoff.getUTCDate() - Number(days) + 1);
      const firstDay = cutoff.toISOString().slice(0, 10);
      const all = await db.order.findMany({
        where: {
          restaurantId: req.restaurantId,
          createdAt: { gte: new Date(cutoff.getTime() - 24 * 3600000) },
        },
        include: {
          items: true,
          orderSession: {
            select: { id: true, paidAt: true, paymentMethod: true },
          },
        },
      });
      const dateKey = (d: Date) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: IST,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d);
      const orders = all.filter((o) => dateKey(o.createdAt) >= firstDay);
      const valid = orders.filter((o) => o.status !== "CANCELLED");
      const dishes: Record<
        string,
        { name: string; quantity: number; sales: number }
      > = {};
      const categories: Record<string, number> = {};
      const hourly = Array(24).fill(0);
      const daily: Record<string, number> = {};
      for (let n = 0; n < Number(days); n++) {
        const d = new Date(cutoff);
        d.setUTCDate(d.getUTCDate() + n);
        daily[d.toISOString().slice(0, 10)] = 0;
      }
      for (const o of valid) {
        const key = dateKey(o.createdAt);
        daily[key] = (daily[key] || 0) + Number(o.subtotal);
        const hour = Number(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: IST,
            hour: "2-digit",
            hourCycle: "h23",
          }).format(o.createdAt),
        );
        hourly[hour]++;
        for (const i of o.items) {
          const dish = (dishes[i.menuItemId] ||= {
            name: i.itemNameSnapshot,
            quantity: 0,
            sales: 0,
          });
          dish.quantity += i.quantity;
          dish.sales += Number(i.total);
          categories[i.categoryNameSnapshot] =
            (categories[i.categoryNameSnapshot] || 0) + Number(i.total);
        }
      }
      const sales = valid.reduce((n, o) => n + Number(o.subtotal), 0);
      const collected = valid
        .filter((o) => o.orderSession.paidAt)
        .reduce((n, o) => n + Number(o.subtotal), 0);
      const active = await db.order.count({
        where: {
          restaurantId: req.restaurantId,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      });
      res.json({
        orders: valid.length,
        cancelled: orders.length - valid.length,
        sales,
        collected,
        paymentMethods: paymentBreakdown(valid),
        average: valid.length ? sales / valid.length : 0,
        active,
        pending: orders.filter((o) => ["NEW", "ACCEPTED"].includes(o.status))
          .length,
        preparing: orders.filter((o) =>
          ["PREPARING", "READY", "SERVED"].includes(o.status),
        ).length,
        completed: orders.filter((o) => o.status === "COMPLETED").length,
        ready: orders.filter((o) => o.status === "READY").length,
        dishes: Object.values(dishes)
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 10),
        categories,
        hourly,
        daily,
      });
    }),
  );
  api.get(
    "/analytics/transactions.pdf",
    rateLimit({
      windowMs: 60000,
      limit: 6,
      keyGenerator: (req) => req.userId,
      message: {
        error: "Please wait a minute before downloading another report.",
      },
    }),
    wrap(async (req, res) => {
      const days = Number(
        z.enum(["7", "14", "21", "30"]).default("7").parse(req.query.days),
      );
      const restaurant = await db.restaurant.findUniqueOrThrow({
        where: { id: req.restaurantId },
      });
      const now = new Date();
      const period = reportPeriod(days, IST, now);
      const sessions = await db.orderSession.findMany({
        where: {
          restaurantId: req.restaurantId,
          paidAt: { gte: period.queryStart, lte: now },
        },
        orderBy: [{ paidAt: "desc" }, { id: "asc" }],
        take: 10001,
        include: {
          orders: {
            where: { status: { not: "CANCELLED" } },
            orderBy: { createdAt: "asc" },
            select: { orderNumber: true, subtotal: true },
          },
        },
      });
      assert(
        sessions.length <= 10000,
        413,
        "This report is too large. Please choose a shorter period.",
      );
      const rows = sessions
        .filter(
          (s) =>
            localDateKey(s.paidAt!, IST) >= period.start && s.orders.length > 0,
        )
        .map((s) => ({
          customerName: s.customerName,
          paidAt: s.paidAt!,
          paymentMethod: s.paymentMethod,
          orderNumbers: s.orders.map((o) => o.orderNumber),
          amount: Number(
            s.orders.reduce(
              (total, o) => total.add(o.subtotal),
              new Prisma.Decimal(0),
            ),
          ),
        }));
      const pdf = await transactionPdf(restaurant, period, rows);
      res.set(
        "Content-Disposition",
        `attachment; filename="transactions-${period.start}-to-${period.end}.pdf"`,
      );
      res.type("application/pdf").send(pdf);
    }),
  );
  api.get(
    "/qr",
    wrap(async (req, res) => {
      const r = await db.restaurant.findUniqueOrThrow({
        where: { id: req.restaurantId },
      });
      const url = `${origin}/r/${r.slug}`;
      const template = req.query.template ?? "classic";
      const color = req.query.color ?? "forest";
      assert(
        isQRTemplate(template) && isQRColor(color),
        400,
        "Choose a supported QR design and color.",
      );
      const png = await restaurantQR({
        name: r.name,
        url,
        template,
        color,
        poster: req.query.poster === "1",
        festival: r.festivalTheme,
        customization: req.query.accent
          ? qrCustomizationSchema.parse(req.query)
          : undefined,
      });
      res.set("Content-Type", "image/png");
      if (req.query.download)
        res.set(
          "Content-Disposition",
          `attachment; filename="${r.slug}-qr.png"`,
        );
      res.send(png);
    }),
  );
  api.use((_req, _res, next) =>
    next(new HttpError(404, "Endpoint not found.")),
  );
  api.use(
    (
      err: unknown,
      _req: Request,
      res: Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof z.ZodError)
        return res
          .status(400)
          .json({ error: err.issues.map((i) => i.message).join(" ") });
      if (err instanceof HttpError) {
        if (err.status === 503) res.set("Retry-After", "1");
        return res.status(err.status).json({ error: err.message });
      }
      if (err instanceof multer.MulterError)
        return res.status(400).json({ error: "Upload one image, up to 5 MB." });
      if (err instanceof SyntaxError)
        return res.status(400).json({ error: "Invalid request body." });
      const dbFailure = databaseFailure(err);
      const meta =
        err instanceof Prisma.PrismaClientKnownRequestError
          ? String(err.meta?.error || "")
          : "";
      process.stdout.write(
        JSON.stringify({
          event: "api.database.failure",
          requestId: res.getHeader("X-Request-Id"),
          route: _req.route?.path,
          ...dbFailure,
          transactionFailure: meta.includes("Unable to start")
            ? "acquisition-timeout"
            : meta.includes("expired")
              ? "transaction-timeout"
              : null,
        }) + "\n",
      );
      if (
        ["/public/orders", "/public/service-requests"].includes(_req.path) &&
        (dbFailure.retryable || dbFailure.unavailable)
      ) {
        res.set("Retry-After", "1");
        return res.status(503).json({
          error: "Your request is taking longer than expected. Please retry.",
        });
      }
      res.status(500).json({ error: "Something went wrong. Please retry." });
    },
  );
  return api;
}

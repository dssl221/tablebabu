import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, transaction } from "./db";
import { accountLimit } from "./hardening";
import {
  admin,
  adminCookie,
  assert,
  authenticate,
  hash,
  HttpError,
  origin,
  setCookie,
  token,
} from "./security";
import {
  draftSchema,
  emptyDraft,
  registerSchema,
  setupIssues,
  slugSchema,
} from "../lib/onboarding";

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const checkDraft = (draft: z.infer<typeof draftSchema>, through: number) => {
  const issues = setupIssues(draft, through);
  if (issues.length) throw new HttpError(422, issues[0].message);
};
export function onboardingRouter() {
  const router = express.Router();
  router.post(
    "/auth/register",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 10,
      message: {
        error:
          "Too many account creation attempts. Please try again in 15 minutes.",
      },
    }),
    accountLimit,
    wrap(async (req, res) => {
      const data = registerSchema.parse(req.body);
      const signedIn = await authenticate(req.headers.cookie);
      assert(
        !signedIn || signedIn.user.email === data.email,
        409,
        "You are already signed in. Log out before creating another account.",
      );
      const passwordHash = await bcrypt.hash(data.password, 12);
      const raw = token();
      const keyHash = hash(data.idempotencyKey);
      try {
        await transaction(async (tx) => {
          let owner = await tx.user.findUnique({
            where: { email: data.email },
          });
          if (owner)
            assert(
              owner.registrationKeyHash === keyHash &&
                (await bcrypt.compare(data.password, owner.passwordHash)),
              409,
              "Unable to create an account with this email. Try signing in.",
            );
          else {
            owner = await tx.user.create({
              data: {
                name: data.name,
                email: data.email,
                passwordHash,
                registrationKeyHash: keyHash,
                termsVersion: data.policyVersion,
                termsAcceptedAt: new Date(),
              },
            });
            await tx.restaurant.create({
              data: {
                ownerId: owner.id,
                name: "Your restaurant",
                slug: `setup-${randomUUID()}`,
                onboardingStatus: "DRAFT",
                isActive: false,
                acceptingOrders: false,
                onboarding: {
                  create: { draft: emptyDraft() as Prisma.InputJsonValue },
                },
              },
            });
          }
          await tx.authSession.create({
            data: {
              userId: owner.id,
              tokenHash: hash(raw),
              expiresAt: new Date(Date.now() + 12 * 3600000),
            },
          });
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        )
          throw new HttpError(
            409,
            "Unable to create this account. Try signing in or use another email.",
          );
        throw e;
      }
      setCookie(res, adminCookie, raw, 12 * 3600);
      res.status(201).json({ redirectTo: "/onboarding" });
    }),
  );
  const setup = express.Router();
  router.use("/onboarding", admin, setup);
  setup.get(
    "/",
    wrap(async (req, res) => {
      const restaurant = await db.restaurant.findUniqueOrThrow({
        where: { id: req.restaurantId },
        select: { id: true, name: true, slug: true, onboardingStatus: true },
      });
      const user = await db.user.findUniqueOrThrow({
        where: { id: req.userId },
        select: { name: true, email: true },
      });
      const progress = await db.restaurantOnboarding.findUnique({
        where: { restaurantId: req.restaurantId },
      });
      res.json({
        restaurant,
        user,
        draft: progress?.draft ?? emptyDraft(),
        currentStep: progress?.currentStep ?? 4,
        version: progress?.version ?? 0,
        completedAt:
          progress?.completedAt ??
          (restaurant.onboardingStatus === "LIVE" ? new Date(0) : null),
        updatedAt: progress?.updatedAt ?? new Date(),
        menuUrl: `${origin}/r/${restaurant.slug}`,
      });
    }),
  );
  setup.get(
    "/slug",
    wrap(async (req, res) => {
      const slug = slugSchema.parse(req.query.slug);
      const taken = await db.restaurant.findFirst({
        where: { slug, id: { not: req.restaurantId } },
        select: { id: true },
      });
      res.json({ slug, available: !taken });
    }),
  );
  setup.patch(
    "/draft",
    wrap(async (req, res) => {
      const data = z
        .object({
          draft: draftSchema,
          version: z.number().int().min(0),
          currentStep: z.number().int().min(1).max(4),
        })
        .parse(req.body);
      if (data.currentStep > 1) checkDraft(data.draft, data.currentStep - 1);
      try {
        const progress = await transaction(async (tx) => {
          const r = await tx.restaurant.findUniqueOrThrow({
            where: { id: req.restaurantId },
          });
          assert(
            r.onboardingStatus === "DRAFT",
            409,
            "Your restaurant is already live. Make changes in Settings or Menu management.",
          );
          const updated = await tx.restaurantOnboarding.updateMany({
            where: {
              restaurantId: req.restaurantId,
              version: data.version,
              completedAt: null,
            },
            data: {
              draft: data.draft as Prisma.InputJsonValue,
              currentStep: data.currentStep,
              version: { increment: 1 },
            },
          });
          assert(
            updated.count,
            409,
            "Your setup changed in another tab. Reload the saved version before continuing.",
          );
          if (data.currentStep > 1)
            await tx.restaurant.update({
              where: { id: req.restaurantId },
              data: {
                name: data.draft.details.name,
                slug: data.draft.details.slug,
              },
            });
          return tx.restaurantOnboarding.findUniqueOrThrow({
            where: { restaurantId: req.restaurantId },
          });
        });
        res.json({ version: progress.version, updatedAt: progress.updatedAt });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        )
          throw new HttpError(
            409,
            "This restaurant URL was just taken. Choose a different URL.",
          );
        throw e;
      }
    }),
  );
  setup.post(
    "/launch",
    wrap(async (req, res) => {
      const { version } = z
        .object({ version: z.number().int().min(0) })
        .parse(req.body);
      const result = await transaction(async (tx) => {
        // Acquire the parent write lock before child inserts take FK locks.
        // Concurrent launches otherwise hold compatible FK locks and deadlock
        // while both upgrade to update the restaurant's unique slug.
        await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${req.restaurantId} FOR UPDATE`;
        const r = await tx.restaurant.findUniqueOrThrow({
          where: { id: req.restaurantId },
        });
        const progress = await tx.restaurantOnboarding.findUnique({
          where: { restaurantId: req.restaurantId },
        });
        assert(
          progress,
          409,
          "This restaurant does not have an onboarding draft.",
        );
        if (progress.completedAt && r.onboardingStatus === "LIVE")
          return { restaurant: r, alreadyLaunched: true };
        assert(
          progress.version === version,
          409,
          "Your setup changed. Reload the saved version before launching.",
        );
        const draft = draftSchema.parse(progress.draft);
        checkDraft(draft, 3);
        assert(
          !(await tx.restaurant.findFirst({
            where: { slug: draft.details.slug, id: { not: req.restaurantId } },
          })),
          409,
          "This restaurant URL is taken. Choose another URL.",
        );
        assert(
          (await tx.menuCategory.count({
            where: { restaurantId: req.restaurantId },
          })) === 0,
          409,
          "Your menu has already been created. Refresh before continuing.",
        );
        for (const [sortOrder, category] of draft.categories.entries())
          await tx.menuCategory.create({
            data: {
              restaurantId: req.restaurantId,
              name: category.name,
              sortOrder,
              items: {
                create: category.items.map((i, index) => ({
                  name: i.name,
                  description: i.description,
                  price: new Prisma.Decimal(i.price),
                  imageUrl: i.imageUrl,
                  isVeg: i.isVeg,
                  isPopular: i.isPopular,
                  isAvailable: true,
                  sortOrder: index,
                })),
              },
            },
          });
        const restaurant = await tx.restaurant.update({
          where: { id: req.restaurantId },
          data: {
            ...draft.details,
            ...draft.brand,
            onboardingStatus: "LIVE",
            isActive: true,
            acceptingOrders: draft.acceptingOrders,
          },
        });
        await tx.restaurantOnboarding.update({
          where: { restaurantId: req.restaurantId },
          data: {
            completedAt: new Date(),
            currentStep: 4,
            version: { increment: 1 },
          },
        });
        return { restaurant, alreadyLaunched: false };
      });
      res.json({
        name: result.restaurant.name,
        menuUrl: `${origin}/r/${result.restaurant.slug}`,
        slug: result.restaurant.slug,
        alreadyLaunched: result.alreadyLaunched,
      });
    }),
  );
  return router;
}

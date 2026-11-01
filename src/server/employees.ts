import express from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import type { Server } from "socket.io";
import { db, transaction } from "./db";
import { assert, platformAdmin } from "./security";
import { customerNameSchema, textField } from "./domain";
import { passwordSchema } from "../lib/onboarding";
import { PLATFORM_PERMISSIONS } from "../lib/platform-permissions";
import { istDateKey, istDayBoundary } from "../lib/time";
import { endLoginActivities, activityState } from "./login-activity";

const roleSchema = z
  .object({
    name: textField(60).pipe(z.string().min(2)),
    permissions: z.array(z.enum(PLATFORM_PERMISSIONS)).min(1).max(5),
  })
  .refine(
    (value) => value.permissions.includes("restaurants:view"),
    "Every employee role requires restaurant view access.",
  );
const employeeSchema = z.object({
  name: customerNameSchema,
  platformRoleId: z.string().min(1),
  allRestaurants: z.boolean(),
  restaurantIds: z.array(z.string().min(1)).max(500),
  isActive: z.boolean(),
});
const selectEmployee = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  employeeVersion: true,
  platformRoleId: true,
  allRestaurants: true,
  platformRole: { select: { id: true, name: true, permissions: true } },
  restaurantAccess: {
    select: { restaurantId: true, restaurant: { select: { name: true } } },
  },
} satisfies Prisma.UserSelect;
async function checkAdmin(tx: Prisma.TransactionClient, authId: string) {
  const session = await tx.authSession.findUnique({
    where: { id: authId },
    include: { user: true },
  });
  assert(
    session &&
      session.expiresAt > new Date() &&
      session.user.isActive &&
      session.user.role === "ADMIN",
    403,
    "Administrator access required.",
  );
}
async function checkAssignments(
  tx: Prisma.TransactionClient,
  roleId: string,
  ids: string[],
) {
  assert(
    await tx.platformRole.findUnique({ where: { id: roleId } }),
    400,
    "Choose a valid employee role.",
  );
  assert(
    new Set(ids).size === ids.length &&
      (await tx.restaurant.count({ where: { id: { in: ids } } })) ===
        ids.length,
    400,
    "Choose valid, distinct restaurants.",
  );
}
async function revoke(
  tx: Prisma.TransactionClient,
  ids: string[],
  reason: string,
) {
  const sessions = await tx.authSession.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });
  await endLoginActivities(
    tx,
    sessions.map((s) => s.id),
    reason,
  );
  await tx.authSession.deleteMany({ where: { userId: { in: ids } } });
  return sessions;
}
export function employeeRouter(io: Server) {
  const router = express.Router();
  router.use(platformAdmin);
  router.get("/roles", async (_req, res) => {
    res.json(await db.platformRole.findMany({ orderBy: { name: "asc" } }));
  });
  router.post("/roles", async (req, res) => {
    const data = roleSchema.parse(req.body);
    const result = await transaction(async (tx) => {
      await checkAdmin(tx, req.authId);
      assert(
        !(await tx.platformRole.findUnique({ where: { name: data.name } })),
        409,
        "A role with this name already exists.",
      );
      const role = await tx.platformRole.create({
        data: { name: data.name, permissions: [...new Set(data.permissions)] },
      });
      await tx.employeeAudit.create({
        data: {
          actorId: req.userId,
          subjectId: role.id,
          action: "ROLE_CREATED",
          details: data,
        },
      });
      return role;
    });
    res.status(201).json(result);
  });
  router.patch("/roles/:id", async (req, res) => {
    const data = roleSchema.parse(req.body),
      version = z.number().int().min(0).parse(req.body.version),
      id = String(req.params.id);
    const result = await transaction(async (tx) => {
      await checkAdmin(tx, req.authId);
      const current = await tx.platformRole.findUnique({ where: { id } });
      assert(current, 404, "Role not found.");
      assert(
        current.version === version,
        409,
        "This role changed. Refresh before saving.",
      );
      assert(
        !(await tx.platformRole.findFirst({
          where: { name: data.name, id: { not: id } },
        })),
        409,
        "A role with this name already exists.",
      );
      const role = await tx.platformRole.update({
        where: { id },
        data: {
          ...data,
          permissions: [...new Set(data.permissions)],
          version: { increment: 1 },
        },
      });
      const employees = await tx.user.findMany({
        where: { role: "STAFF", platformRoleId: id },
        select: { id: true },
      });
      const sessions = await revoke(
        tx,
        employees.map((e) => e.id),
        "ACCESS_CHANGED",
      );
      await tx.employeeAudit.create({
        data: {
          actorId: req.userId,
          subjectId: id,
          action: "ROLE_UPDATED",
          details: {
            before: { name: current.name, permissions: current.permissions },
            after: data,
          },
        },
      });
      return { role, sessions };
    });
    for (const session of result.sessions)
      io.in(`auth:${session.id}`).disconnectSockets(true);
    res.json(result.role);
  });
  router.get("/activity", async (req, res) => {
    const today = istDateKey(),
      defaultStart = istDateKey(new Date(Date.now() - 29 * 86400000));
    const query = z
      .object({
        from: z.string().default(defaultStart),
        to: z.string().default(today),
        employeeId: z.string().optional(),
        page: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .parse(req.query);
    let from: Date, to: Date;
    try {
      from = istDayBoundary(query.from);
      to = istDayBoundary(query.to, true);
    } catch {
      res.status(400).json({ error: "Choose valid IST dates." });
      return;
    }
    assert(
      to >= from && to.getTime() - from.getTime() <= 366 * 86400000,
      400,
      "Choose a date range of up to one year.",
    );
    const where: Prisma.LoginActivityWhereInput = {
      user: { role: "STAFF" },
      ...(query.employeeId ? { userId: query.employeeId } : {}),
      signedInAt: { lte: to },
      OR: [
        { endedAt: { gte: from } },
        { endedAt: null, expiresAt: { gte: from } },
      ],
    };
    const [sessions, total] = await Promise.all([
      db.loginActivity.findMany({
        where,
        orderBy: [{ signedInAt: "desc" }, { id: "asc" }],
        skip: query.page * 50,
        take: 50,
        include: { user: { select: { name: true, email: true } } },
      }),
      db.loginActivity.count({ where }),
    ]);
    res.json({
      total,
      sessions: sessions.map(({ authSessionId: _auth, ...s }) => ({
        ...s,
        ...activityState(s),
      })),
    });
  });
  router.get("/", async (req, res) => {
    const query = z
      .object({
        search: z.string().max(100).default(""),
        page: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .parse(req.query);
    const where: Prisma.UserWhereInput = {
      role: "STAFF",
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ],
    };
    const [employees, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          ...selectEmployee,
          loginActivities: {
            orderBy: { signedInAt: "desc" },
            take: 1,
            select: {
              signedInAt: true,
              endedAt: true,
              endReason: true,
              expiresAt: true,
            },
          },
          _count: {
            select: {
              authSessions: { where: { expiresAt: { gt: new Date() } } },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 25,
        skip: query.page * 25,
      }),
      db.user.count({ where }),
    ]);
    res.json({
      total,
      employees: employees.map((e) => ({
        ...e,
        lastSession: e.loginActivities[0]
          ? { ...e.loginActivities[0], ...activityState(e.loginActivities[0]) }
          : null,
      })),
    });
  });
  router.post("/", async (req, res) => {
    const data = employeeSchema.parse(req.body);
    const email = z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(254)
      .parse(req.body.email);
    const passwordHash = await bcrypt.hash(
      passwordSchema.parse(req.body.password),
      12,
    );
    const employee = await transaction(async (tx) => {
      await checkAdmin(tx, req.authId);
      await checkAssignments(tx, data.platformRoleId, data.restaurantIds);
      assert(
        !(await tx.user.findUnique({ where: { email } })),
        409,
        "This email is already registered. Existing accounts cannot be converted to employees.",
      );
      const { restaurantIds, ...settings } = data;
      const user = await tx.user.create({
        data: {
          ...settings,
          email,
          passwordHash,
          role: "STAFF",
          restaurantAccess: {
            create: restaurantIds.map((restaurantId) => ({ restaurantId })),
          },
        },
        select: selectEmployee,
      });
      await tx.employeeAudit.create({
        data: {
          actorId: req.userId,
          subjectId: user.id,
          action: "EMPLOYEE_CREATED",
          details: { ...data, email },
        },
      });
      return user;
    });
    res.status(201).json(employee);
  });
  router.patch("/:id", async (req, res) => {
    const email =
      req.body.email === undefined
        ? undefined
        : z
            .string()
            .trim()
            .toLowerCase()
            .email()
            .max(254)
            .parse(req.body.email);
    const data = employeeSchema.parse(req.body),
      id = String(req.params.id),
      version = z.number().int().min(0).parse(req.body.version);
    const passwordHash = req.body.password
      ? await bcrypt.hash(passwordSchema.parse(req.body.password), 12)
      : undefined;
    const result = await transaction(async (tx) => {
      await checkAdmin(tx, req.authId);
      await checkAssignments(tx, data.platformRoleId, data.restaurantIds);
      const before = await tx.user.findFirst({
        where: { id, role: "STAFF" },
        select: selectEmployee,
      });
      assert(before, 404, "Employee not found.");
      if (email && email !== before.email)
        assert(
          !(await tx.user.findUnique({ where: { email } })),
          409,
          "This email is already registered.",
        );
      assert(
        before.employeeVersion === version,
        409,
        "This employee changed. Refresh before saving.",
      );
      await tx.employeeRestaurantAccess.deleteMany({
        where: { employeeId: id },
      });
      const { restaurantIds, ...settings } = data;
      const employee = await tx.user.update({
        where: { id },
        data: {
          ...settings,
          ...(email ? { email } : {}),
          ...(passwordHash ? { passwordHash } : {}),
          employeeVersion: { increment: 1 },
          restaurantAccess: {
            create: restaurantIds.map((restaurantId) => ({ restaurantId })),
          },
        },
        select: selectEmployee,
      });
      const sessions = await revoke(
        tx,
        [id],
        data.isActive
          ? passwordHash
            ? "PASSWORD_RESET"
            : "ACCESS_CHANGED"
          : "DISABLED",
      );
      await tx.employeeAudit.create({
        data: {
          actorId: req.userId,
          subjectId: id,
          action: "EMPLOYEE_UPDATED",
          details: JSON.parse(
            JSON.stringify({
              before,
              after: { ...data, ...(email ? { email } : {}) },
              passwordReset: !!passwordHash,
            }),
          ),
        },
      });
      return { employee, sessions };
    });
    for (const session of result.sessions)
      io.in(`auth:${session.id}`).disconnectSockets(true);
    res.json(result.employee);
  });
  return router;
}

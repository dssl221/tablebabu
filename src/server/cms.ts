import express from "express";
import { z } from "zod";
import { db } from "./db";
import { platformAdmin, assert } from "./security";
import { defaultSiteContent, siteContentSchema } from "../lib/site-content";
export function cmsRouter() {
  const router = express.Router();
  router.use("/platform/content", platformAdmin);
  router.get("/platform/content", async (_req, res) => {
    const row = await db.siteContent.upsert({
      where: { id: "homepage" },
      create: { id: "homepage", draft: defaultSiteContent },
      update: {},
    });
    const revisions = await db.siteRevision.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({ ...row, revisions });
  });
  router.post("/platform/content", async (req, res) => {
    const input = z
      .object({
        version: z.number().int().nonnegative(),
        action: z.enum(["SAVE", "PUBLISH", "RESTORE"]),
        content: siteContentSchema.optional(),
        revisionId: z.string().max(100).optional(),
      })
      .parse(req.body);
    await db.$transaction(async (tx) => {
      const row = await tx.siteContent.findUnique({
        where: { id: "homepage" },
      });
      assert(
        row && row.version === input.version,
        409,
        "Content changed. Reload before saving.",
      );
      let content = input.content;
      if (input.action === "RESTORE") {
        assert(input.revisionId, 400, "Choose a revision.");
        const revision = await tx.siteRevision.findUnique({
          where: { id: input.revisionId },
        });
        assert(revision, 404, "Revision not found.");
        content = siteContentSchema.parse(revision.content);
      }
      if (input.action === "PUBLISH")
        content = siteContentSchema.parse(row.draft);
      assert(content, 400, "Page content is required.");
      const result = await tx.siteContent.updateMany({
        where: { id: "homepage", version: input.version },
        data: {
          draft: content,
          version: { increment: 1 },
          ...(input.action === "PUBLISH"
            ? { published: content, publishedAt: new Date() }
            : {}),
        },
      });
      assert(result.count === 1, 409, "Content changed. Reload before saving.");
      await tx.siteRevision.create({
        data: { actorId: req.userId!, action: input.action, content },
      });
    });
    res.json({ ok: true });
  });
  return router;
}

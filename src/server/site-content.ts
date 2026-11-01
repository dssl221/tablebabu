import { headers } from "next/headers";
import { db } from "./db";
import { defaultSiteContent, siteContentSchema } from "../lib/site-content";
export async function readHomepage(preview: boolean) {
  if (preview) {
    const { authenticate } = await import("./security");
    const auth = await authenticate(
      (await headers()).get("cookie") || undefined,
    );
    if (auth?.user.role !== "ADMIN") preview = false;
  }
  const row = await db.siteContent.findUnique({ where: { id: "homepage" } });
  const content = preview ? row?.draft : row?.published;
  return content ? siteContentSchema.parse(content) : defaultSiteContent;
}

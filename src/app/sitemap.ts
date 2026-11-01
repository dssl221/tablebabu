import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only canonical, indexable marketing pages belong here. App and guest
  // routes inherit noindex. No fabricated lastModified timestamp.
  return [{ url: `${publicOrigin()}/` }];
}

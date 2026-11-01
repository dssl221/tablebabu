import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    // Let crawlers read the existing noindex metadata on application pages.
    // Authentication remains the access boundary; robots.txt is not security.
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${publicOrigin()}/sitemap.xml`,
  };
}

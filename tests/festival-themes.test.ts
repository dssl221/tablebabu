import { expect, it } from "vitest";
import { festivalIds, festivalTheme } from "../src/lib/festival-themes";
import { settingsSchema } from "../src/server/domain";
import { siteContentSchema, defaultSiteContent } from "../src/lib/site-content";
import { restaurantQR } from "../src/server/qr-design";
it("validates restaurant and website themes and supports older CMS content", () => {
  for (const festivalTheme of festivalIds) {
    expect(settingsSchema.safeParse({ festivalTheme }).success).toBe(true);
    expect(siteContentSchema.safeParse({ ...defaultSiteContent, festivalTheme }).success).toBe(true);
  }
  expect(settingsSchema.safeParse({ festivalTheme: "<script>" }).success).toBe(false);
  const { festivalTheme: _, ...old } = defaultSiteContent;
  expect(siteContentSchema.parse(old).festivalTheme).toBe("none");
  expect(festivalTheme("unknown").name).toBe("Everyday");
});
it("adapts QR artwork to the saved restaurant theme with deterministic defaults", async () => {
  const base = { name: "Festival Bistro", url: "https://example.com/r/bistro", template: "classic" as const, color: "forest" as const, poster: true };
  const everyday = await restaurantQR(base);
  expect(everyday.equals(await restaurantQR({ ...base, festival: "none" }))).toBe(true);
  const diwali = await restaurantQR({ ...base, festival: "diwali" });
  const puja = await restaurantQR({ ...base, festival: "durga-puja" });
  expect(diwali.equals(everyday)).toBe(false);
  expect(diwali.equals(puja)).toBe(false);
});

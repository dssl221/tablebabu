import { expect, it } from "vitest";
import { defaultSiteContent, siteContentSchema } from "../src/lib/site-content";
it("limits editable content and prevents arbitrary image resources", () => {
  expect(siteContentSchema.safeParse(defaultSiteContent).success).toBe(true);
  expect(
    siteContentSchema.safeParse({
      ...defaultSiteContent,
      heroImage: "https://untrusted.test/pixel",
    }).success,
  ).toBe(false);
  expect(
    siteContentSchema.safeParse({ ...defaultSiteContent, faqs: [] }).success,
  ).toBe(false);
  expect(
    siteContentSchema.safeParse({
      ...defaultSiteContent,
      headline: "a".repeat(81),
    }).success,
  ).toBe(false);
});

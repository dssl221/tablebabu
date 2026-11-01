import { POLICY_VERSION } from "../src/lib/legal";
import { describe, it, expect } from "vitest";
import {
  draftSchema,
  emptyDraft,
  registerSchema,
  setupIssues,
  slugify,
  slugSchema,
} from "../src/lib/onboarding";
const key = "bd386741-06c9-4dd0-bb4c-5ecc285cf9c7";
describe("Owner onboarding validation", () => {
  it("normalizes email and name and requires a matching strong password", () => {
    const input = {
      name: "  Arjun  ",
      email: " OWNER@EXAMPLE.COM ",
      password: "My restaurant passphrase",
      confirmPassword: "My restaurant passphrase",
      idempotencyKey: key,
      termsAccepted: true,
      adultConfirmed: true,
      policyVersion: POLICY_VERSION,
    };
    const owner = registerSchema.parse(input);
    expect(owner.name).toBe("Arjun");
    expect(owner.email).toBe("owner@example.com");
    expect(
      registerSchema.safeParse({ ...input, termsAccepted: false }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...input, adultConfirmed: false }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...input, policyVersion: "old" }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...input, confirmPassword: "different" })
        .success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        ...input,
        password: "password123456",
        confirmPassword: "password123456",
      }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        ...input,
        password: "é".repeat(40),
        confirmPassword: "é".repeat(40),
      }).success,
    ).toBe(false);
  });
  it("accepts incomplete drafts but blocks incomplete launch", () => {
    const d = emptyDraft();
    expect(draftSchema.safeParse(d).success).toBe(true);
    expect(setupIssues(d).map((i) => i.field)).toEqual(
      expect.arrayContaining([
        "details.name",
        "details.slug",
        "details.address",
        "categories",
      ]),
    );
  });
  it("validates permanent URLs and normalizes suggestions", () => {
    expect(slugify("Café & Kitchen!")).toBe("cafe-kitchen");
    for (const slug of [
      "admin",
      "setup-test",
      "bad--slug",
      "UPPERCASE",
      "x",
      "<script>",
    ])
      expect(slugSchema.safeParse(slug).success).toBe(false);
    expect(slugSchema.safeParse("cafe-kolkata").success).toBe(true);
  });
  it("checks drafts by step and rejects invalid monetary values", () => {
    const d = emptyDraft();
    d.details = {
      ...d.details,
      name: "Test Cafe",
      slug: "test-cafe",
      address: "18 Park Street",
    };
    expect(setupIssues(d, 1)).toHaveLength(0);
    d.brand.openingTime = "99:99";
    expect(setupIssues(d, 2)[0].field).toBe("brand.openingTime");
    d.brand.openingTime = "11:00";
    d.categories = [
      {
        id: key,
        name: "Starters",
        items: [
          {
            id: "c3c085ce-9ac2-4d64-9730-87581a318943",
            name: "Soup",
            price: ".",
            description: "",
            imageUrl: "",
            isVeg: true,
            isPopular: false,
          },
        ],
      },
    ];
    expect(setupIssues(d).some((i) => i.field.endsWith("price"))).toBe(true);
    d.categories[0].items[0].price = "120.50";
    expect(setupIssues(d)).toHaveLength(0);
  });
});

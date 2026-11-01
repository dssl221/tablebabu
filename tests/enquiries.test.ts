import { describe, expect, it } from "vitest";
import { enquirySchema, enquiryChangeSchema } from "../src/lib/enquiries";
const valid = {
  ownerName: "Rahul",
  hotelName: "Aman Hotel",
  city: "Kolkata",
  email: "owner@example.test",
  phone: "9876543210",
  message: "Please help us set up our menu.",
  contactAllowed: true,
  idempotencyKey: "f7df3ea7-9255-4ad0-bd44-eb36af2e3297",
};
describe("hotel enquiries", () => {
  it("normalizes email and supports optional mobile numbers", () => {
    expect(
      enquirySchema.parse({
        ...valid,
        email: " OWNER@example.test ",
        phone: "",
      }).email,
    ).toBe("owner@example.test");
    expect(
      enquirySchema.safeParse({ ...valid, phone: "+91 9876543210" }).success,
    ).toBe(true);
  });
  it("rejects spam traps, missing contact agreement, malformed contact details and oversized messages", () => {
    for (const change of [
      { website: "spam" },
      { contactAllowed: false },
      { phone: "123" },
      { email: "invalid" },
      { message: "x".repeat(2001) },
      { ownerName: "Bad\u0000name" },
    ])
      expect(enquirySchema.safeParse({ ...valid, ...change }).success).toBe(
        false,
      );
  });
  it("requires a version and exactly one update action", () => {
    expect(
      enquiryChangeSchema.safeParse({ version: 0, status: "CONTACTED" })
        .success,
    ).toBe(true);
    for (const data of [
      { version: 0 },
      { version: -1, assignedToId: "a" },
      { version: 0, assignedToId: "a", status: "CLOSED" },
      { version: 0, status: "NEW" },
    ])
      expect(enquiryChangeSchema.safeParse(data).success).toBe(false);
  });
});

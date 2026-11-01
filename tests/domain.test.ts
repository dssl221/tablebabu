import { describe, expect, it } from "vitest";
import { orderStage } from "../src/lib/order-workflow";
import {
  customerNameSchema,
  isOpen,
  orderSchema,
  transitions,
} from "../src/server/domain";
const restaurant = {
  isActive: true,
  acceptingOrders: true,
  openingTime: "11:00",
  closingTime: "23:00",
  timezone: "Asia/Kolkata",
};
describe("Guest identity", () => {
  it("normalizes names without requiring a legal name", () => {
    expect(customerNameSchema.parse("  Rahul   Roy  ")).toBe("Rahul Roy");
    expect(customerNameSchema.parse("রাহুল")).toBe("রাহুল");
    expect(customerNameSchema.parse("O’Connor")).toBe("O’Connor");
  });
  it.each([
    "",
    "X",
    "12345",
    "<script>alert(1)</script>",
    "😀😀",
    "a".repeat(41),
  ])("rejects invalid name %s", (name) => {
    expect(customerNameSchema.safeParse(name).success).toBe(false);
  });
});
describe("Restaurant opening hours", () => {
  it("uses local time and an exclusive closing boundary", () => {
    expect(isOpen(restaurant, new Date("2026-10-04T05:29:00Z"))).toBe(false);
    expect(isOpen(restaurant, new Date("2026-10-04T05:30:00Z"))).toBe(true);
    expect(isOpen(restaurant, new Date("2026-10-04T17:30:00Z"))).toBe(false);
  });
  it("supports overnight service and manual pause", () => {
    const overnight = {
      ...restaurant,
      openingTime: "18:00",
      closingTime: "02:00",
    };
    expect(isOpen(overnight, new Date("2026-10-04T19:30:00Z"))).toBe(true);
    expect(isOpen(overnight, new Date("2026-10-04T05:00:00Z"))).toBe(false);
    expect(
      isOpen(
        { ...restaurant, acceptingOrders: false },
        new Date("2026-10-04T12:00:00Z"),
      ),
    ).toBe(false);
  });
});
describe("Order invariants", () => {
  it("groups historical statuses without hiding cancellations", () => {
    expect(["NEW", "ACCEPTED"].map(orderStage)).toEqual([
      "RECEIVED",
      "RECEIVED",
    ]);
    expect(["PREPARING", "READY", "SERVED"].map(orderStage)).toEqual([
      "PREPARING",
      "PREPARING",
      "PREPARING",
    ]);
    expect(orderStage("COMPLETED")).toBe("COMPLETED");
    expect(orderStage("CANCELLED")).toBe("CANCELLED");
  });
  it("rejects repeated items, invalid quantities, and absent idempotency", () => {
    const item = { menuItemId: "item", quantity: 1 };
    const base = {
      restaurantSlug: "bistro",
      idempotencyKey: "494e2d29-5dd5-4ea6-a996-c4f574898af1",
      items: [item],
    };
    expect(orderSchema.safeParse(base).success).toBe(true);
    expect(
      orderSchema.safeParse({ ...base, items: [item, item] }).success,
    ).toBe(false);
    expect(
      orderSchema.safeParse({ ...base, items: [{ ...item, quantity: 0 }] })
        .success,
    ).toBe(false);
    expect(
      orderSchema.safeParse({ ...base, idempotencyKey: undefined }).success,
    ).toBe(false);
  });
  it("supports received to preparing to completed without skipping preparation", () => {
    expect(transitions.NEW).toContain("PREPARING");
    expect(transitions.PREPARING).toContain("COMPLETED");
    expect(transitions.NEW).not.toContain("COMPLETED");
  });
  it("never permits reversal from a terminal state", () => {
    expect(transitions.COMPLETED).toEqual([]);
    expect(transitions.CANCELLED).toEqual([]);
    expect(transitions.NEW).not.toContain("READY");
  });
});

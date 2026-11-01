import { describe, expect, it } from "vitest";
import {
  subscriptionAllowsOrders,
  subscriptionDays,
  subscriptionStatus,
} from "../src/lib/subscription";
import { isOpen } from "../src/server/domain";
const now = new Date("2026-10-06T12:00:00.000Z");
describe("Subscription access", () => {
  it("keeps existing unconfigured restaurants available and enforces freeze independently of opening settings", () => {
    expect(subscriptionAllowsOrders({}, now)).toBe(true);
    expect(subscriptionDays({}, now)).toBeNull();
    expect(
      isOpen(
        {
          isActive: true,
          acceptingOrders: true,
          openingTime: "00:00",
          closingTime: "00:00",
          timezone: "Asia/Kolkata",
          platformFrozen: true,
        },
        now,
      ),
    ).toBe(false);
  });
  it("enforces start and end boundaries and clamps days remaining", () => {
    const r = {
      subscriptionStartsAt: now,
      subscriptionEndsAt: "2026-10-07T12:00:00.000Z",
    };
    expect(subscriptionStatus(r, now)).toBe("Active");
    expect(subscriptionDays(r, now)).toBe(1);
    expect(subscriptionStatus(r, new Date("2026-10-06T11:59:59Z"))).toBe(
      "Scheduled",
    );
    expect(subscriptionAllowsOrders(r, new Date(r.subscriptionEndsAt))).toBe(
      false,
    );
    expect(subscriptionDays(r, new Date("2026-10-08Z"))).toBe(0);
    expect(subscriptionStatus({ ...r, platformFrozen: true }, now)).toBe(
      "Frozen",
    );
  });
});

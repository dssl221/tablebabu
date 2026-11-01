import { describe, expect, it, vi } from "vitest";
vi.mock("../src/server/db", () => ({ db: {} }));
import { istDateKey, istDayBoundary, istDateTime } from "../src/lib/time";
import { activityState } from "../src/server/login-activity";
import { principalFor } from "../src/server/access";
describe("IST presentation and UTC storage boundaries", () => {
  it("converts a full IST day to UTC, including midnight rollover", () => {
    expect(istDateKey("2026-10-05T18:30:00Z")).toBe("2026-10-06");
    expect(istDayBoundary("2026-10-06").toISOString()).toBe(
      "2026-10-05T18:30:00.000Z",
    );
    expect(istDayBoundary("2026-10-06", true).toISOString()).toBe(
      "2026-10-06T18:29:59.999Z",
    );
    expect(istDateTime("2026-10-05T18:30:00Z")).toContain("6 Oct 2026");
    expect(istDateTime("2026-10-05T18:30:00Z")).toContain("IST");
    expect(() => istDayBoundary("2026-02-30")).toThrow();
  });
  it("reports expiry separately from explicit logout and never extends duration beyond expiry", () => {
    const row = {
      signedInAt: new Date("2026-10-06T00:00:00Z"),
      expiresAt: new Date("2026-10-06T12:00:00Z"),
      endedAt: null,
      endReason: null,
    };
    expect(activityState(row, new Date("2026-10-07Z"))).toMatchObject({
      endReason: "EXPIRED",
      durationSeconds: 43200,
    });
    expect(activityState(row, new Date("2026-10-06T01:00:00Z"))).toMatchObject({
      status: "Signed in",
      durationSeconds: 3600,
      endedAt: null,
    });
  });
});
describe("Platform employee permissions", () => {
  it("never infers unrestricted access from a custom role", () => {
    const principal = principalFor({
      role: "STAFF",
      allRestaurants: false,
      platformRole: { permissions: ["restaurants:view"] },
      restaurantAccess: [{ restaurantId: "assigned" }],
    });
    expect(principal.isAdmin).toBe(false);
    expect(principal.allRestaurants).toBe(false);
    expect(principal.restaurantIds).toEqual(["assigned"]);
    expect(principal.permissions).not.toContain("payments:record");
  });
});

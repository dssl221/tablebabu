import { describe, expect, it } from "vitest";
import {
  canResolvePrivacyRequest,
  privacyDeadlines,
  privacyUpdateSchema,
} from "../src/lib/privacy-workflow";
describe("privacy handling", () => {
  it("does not confuse a status change with verified resolution", () => {
    const partial = privacyUpdateSchema.parse({
      version: 0,
      status: "RESOLVED",
      resolution: "Operator processed the request.",
    });
    expect(canResolvePrivacyRequest(partial)).toBe(false);
    expect(
      canResolvePrivacyRequest({
        ...partial,
        acknowledged: true,
        verification: "Verified using existing owner account.",
        response: "Response emailed with outcome and contact.",
      }),
    ).toBe(true);
  });
  it("uses elapsed UTC time for the published service targets", () => {
    const dates = privacyDeadlines("2026-12-31T20:00:00Z");
    expect(dates.acknowledgement.toISOString()).toBe(
      "2027-01-02T20:00:00.000Z",
    );
    expect(dates.response.toISOString()).toBe("2027-01-30T20:00:00.000Z");
    expect(
      privacyUpdateSchema.safeParse({
        version: 0,
        status: "RESOLVED",
        resolution: "unsafe\u0000value",
      }).success,
    ).toBe(false);
  });
});

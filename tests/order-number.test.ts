import { describe, it, expect } from "vitest";
import {
  orderYear,
  formatOrderNumber,
  databaseFailure,
} from "../src/server/order-placement";
import { Prisma } from "@prisma/client";
describe("hotel order identity", () => {
  it("uses the IST year across UTC New Year boundaries", () => {
    expect(orderYear(new Date("2026-12-31T18:29:59.999Z"))).toBe(2026);
    expect(orderYear(new Date("2026-12-31T18:30:00.000Z"))).toBe(2027);
  });
  it("pads to six digits without truncating longer counters", () => {
    expect(formatOrderNumber("AMAN", 2026, 1)).toBe("AMAN:2026:000001");
    expect(formatOrderNumber("HILDA", 2027, 1000000)).toBe(
      "HILDA:2027:1000000",
    );
    expect(() => formatOrderNumber("<AMAN>", 2026, 1)).toThrow();
    expect(() => formatOrderNumber("AMAN", 2026, 0)).toThrow();
  });
  it("retries only known transaction conflicts, not unique or unknown errors", () => {
    const error = (code: string, meta?: Record<string, unknown>) =>
      new Prisma.PrismaClientKnownRequestError("hidden", {
        code,
        clientVersion: "test",
        meta,
      });
    expect(databaseFailure(error("P2010", { code: "40001" })).retryable).toBe(
      true,
    );
    expect(databaseFailure(error("P2010", { code: "40P01" })).retryable).toBe(
      true,
    );
    expect(databaseFailure(error("P2002")).retryable).toBe(false);
    expect(databaseFailure(error("P2024")).unavailable).toBe(true);
    expect(databaseFailure(new Error("unknown")).retryable).toBe(false);
    const wrapped = new Prisma.PrismaClientUnknownRequestError(
      'ConnectorError(PostgresError { code: "40001", message: "private SQL parameters" })',
      { clientVersion: "test" },
    );
    expect(databaseFailure(wrapped).postgresCode).toBe("40001");
    expect(JSON.stringify(databaseFailure(wrapped))).not.toContain("private");
  });
});

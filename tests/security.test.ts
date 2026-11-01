import { describe, expect, it, vi } from "vitest";
vi.mock("../src/server/db", () => ({ db: {} }));
import { withUploadCapacity } from "../src/server/hardening";
import { token, validToken } from "../src/server/security";

describe("Credential validation", () => {
  it("accepts generated credentials and rejects malformed or oversized values", () => {
    expect(validToken(token())).toBe(true);
    for (const value of [
      undefined,
      "",
      "a".repeat(42),
      "a".repeat(44),
      "<".repeat(43),
    ]) {
      expect(validToken(value)).toBe(false);
    }
  });
});

describe("Bounded image processing", () => {
  it("limits concurrent decoders and releases capacity after success or failure", async () => {
    const releases: (() => void)[] = [];
    const hold = () => new Promise<void>((resolve) => releases.push(resolve));
    const pending = [withUploadCapacity(hold), withUploadCapacity(hold)];
    try {
      await expect(
        withUploadCapacity(async () => "third"),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      releases.forEach((release) => release());
      await Promise.all(pending);
    }
    await expect(
      withUploadCapacity(async () => {
        throw new Error("decode failed");
      }),
    ).rejects.toThrow("decode failed");
    await expect(withUploadCapacity(async () => "available")).resolves.toBe(
      "available",
    );
  });
});

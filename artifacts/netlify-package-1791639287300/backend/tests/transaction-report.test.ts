import { expect, it } from "vitest";
import {
  localDateKey,
  reportPeriod,
  transactionPdf,
} from "../src/server/transaction-report";
it("uses local calendar days across midnight and month boundaries", () => {
  const period = reportPeriod(
    7,
    "Asia/Kolkata",
    new Date("2026-10-04T20:00:00Z"),
  );
  expect(period.start).toBe("2026-09-29");
  expect(period.end).toBe("2026-10-05");
  expect(
    reportPeriod(30, "Asia/Kolkata", new Date("2026-10-04T20:00:00Z")).start,
  ).toBe("2026-09-06");
  expect(localDateKey(new Date("2026-10-04T18:29:00Z"), "Asia/Kolkata")).toBe(
    "2026-10-04",
  );
});
it("generates a valid empty PDF report", async () => {
  const pdf = await transactionPdf(
    { name: "Test restaurant", currency: "INR", timezone: "Asia/Kolkata" },
    { start: "2026-09-29", end: "2026-10-05" },
    [],
  );
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(1000);
  expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
});

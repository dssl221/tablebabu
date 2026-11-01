import { expect, it } from "vitest";
import { paymentBreakdown } from "../src/server/payment-analytics";

it("counts visits once and separates choices from received amounts", () => {
  const order = (
    id: string,
    method: string | null,
    amount: string,
    paid = false,
    status = "COMPLETED",
  ) => ({
    status,
    subtotal: amount,
    orderSession: {
      id,
      paymentMethod: method,
      paidAt: paid ? new Date() : null,
    },
  });
  const result = paymentBreakdown([
    order("a", "UPI", "290", true),
    order("a", "UPI", "120", true),
    order("b", "UPI", "50"),
    order("c", "CASH", "0.10", true),
    order("c", "CASH", "0.20", true),
    order("d", null, "100", true),
    order("e", null, "80"),
    order("f", "CASH", "999", true, "CANCELLED"),
  ]);
  expect(result[0]).toEqual({
    method: "UPI",
    visits: 2,
    paidVisits: 1,
    pendingVisits: 1,
    collected: 410,
    pending: 50,
  });
  expect(result[1]).toEqual({
    method: "CASH",
    visits: 1,
    paidVisits: 1,
    pendingVisits: 0,
    collected: 0.3,
    pending: 0,
  });
  expect(result[2]).toEqual({
    method: "UNRECORDED",
    visits: 2,
    paidVisits: 1,
    pendingVisits: 1,
    collected: 100,
    pending: 80,
  });
});
it("returns zero totals for an empty period", () => {
  expect(
    paymentBreakdown([]).every(
      (row) => row.visits === 0 && row.collected === 0 && row.pending === 0,
    ),
  ).toBe(true);
});

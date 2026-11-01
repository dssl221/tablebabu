export function paymentBreakdown(
  orders: {
    status: string;
    subtotal: unknown;
    orderSession: {
      id: string;
      paidAt: Date | null;
      paymentMethod: string | null;
    };
  }[],
) {
  const methods = ["UPI", "CASH", "UNRECORDED"] as const;
  return methods.map((method) => {
    const matching = orders.filter(
      (o) =>
        o.status !== "CANCELLED" &&
        (o.orderSession.paymentMethod || "UNRECORDED") === method,
    );
    const paid = matching.filter((o) => !!o.orderSession.paidAt);
    const pending = matching.filter((o) => !o.orderSession.paidAt);
    const sum = (rows: typeof matching) =>
      rows.reduce((n, o) => n + Math.round(Number(o.subtotal) * 100), 0) / 100;
    return {
      method,
      visits: new Set(matching.map((o) => o.orderSession.id)).size,
      paidVisits: new Set(paid.map((o) => o.orderSession.id)).size,
      pendingVisits: new Set(pending.map((o) => o.orderSession.id)).size,
      collected: sum(paid),
      pending: sum(pending),
    };
  });
}

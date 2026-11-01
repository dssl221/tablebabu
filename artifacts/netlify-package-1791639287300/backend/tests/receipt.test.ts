import { describe, expect, it } from "vitest";
import { Prisma, type Restaurant } from "@prisma/client";
import { renderReceipt } from "../src/server/receipt";

describe("payment receipt", () => {
  it("escapes untrusted text and totals only non-cancelled snapshot orders", () => {
    const restaurant = {
      name: "<script>alert(1)</script>",
      address: "A & B",
      phone: "",
      currency: "INR",
      timezone: "Asia/Kolkata",
    } as Restaurant;
    const order = {
      orderNumber: "AMAN:2026:001042",
      status: "COMPLETED",
      subtotal: new Prisma.Decimal("240.50"),
      items: [
        {
          itemNameSnapshot: "Paneer <special>",
          quantity: 2,
          priceSnapshot: new Prisma.Decimal("120.25"),
          total: new Prisma.Decimal("240.50"),
        },
      ],
    };
    const html = renderReceipt(
      restaurant,
      {
        customerName: "Rahul & Priya",
        paymentMethod: "UPI",
        orders: [
          order,
          { ...order, orderNumber: "AMAN:2026:001043", status: "CANCELLED" },
        ],
      },
      new Date("2026-10-05T06:00:00Z"),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Rahul &amp; Priya");
    expect(html).toContain("Paneer &lt;special&gt;");
    expect(html).toContain("&#8377;240.50");
    expect(html).not.toContain("AMAN:2026:001043");
    expect(html).toContain("PAID · UPI");
  });
});

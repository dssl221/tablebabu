import { IST } from "../lib/time";
import { Prisma, type Restaurant } from "@prisma/client";

const escape = (value: string | number) =>
  String(value)
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    )
    .replace(/[^\x00-\x7f]/gu, (c) => `&#${c.codePointAt(0)};`);
type ReceiptSession = {
  customerName: string;
  paymentMethod: string | null;
  orders: {
    orderNumber: string;
    status: string;
    subtotal: Prisma.Decimal;
    items: {
      itemNameSnapshot: string;
      quantity: number;
      priceSnapshot: Prisma.Decimal;
      total: Prisma.Decimal;
    }[];
  }[];
};
export function renderReceipt(
  restaurant: Restaurant,
  session: ReceiptSession,
  paidAt: Date,
) {
  const orders = session.orders.filter((o) => o.status !== "CANCELLED");
  const money = (amount: Prisma.Decimal) =>
    escape(
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: restaurant.currency,
      }).format(Number(amount)),
    );
  const total = orders.reduce(
    (sum, o) => sum.add(o.subtotal),
    new Prisma.Decimal(0),
  );
  const number = `R-${orders[0]?.orderNumber ?? "0"}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt ${number}</title><style>
  *{box-sizing:border-box}body{font:16px/1.6 system-ui,sans-serif;color:#172f27;background:#f6f6f0;margin:0;padding:24px}main{max-width:720px;margin:auto;background:white;padding:32px;border:1px solid #dce2d5;border-radius:12px}h1{margin:0;font-size:26px}p{margin:8px 0}header{border-bottom:1px solid #dce2d5;padding-bottom:20px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{text-align:right;padding:10px 4px;border-bottom:1px solid #eee}th:first-child,td:first-child{text-align:left;overflow-wrap:anywhere}h2{font-size:17px;margin-top:26px}.total{display:flex;justify-content:space-between;border-top:2px solid #172f27;padding-top:16px;font-size:22px;font-weight:bold}.paid{font-weight:bold;color:#235b3e}footer{font-size:13px;color:#55634f;margin-top:24px}@media(max-width:480px){body{padding:8px}main{padding:18px}table{font-size:12px}}@media print{body{padding:0;background:white}main{border:0;padding:0}tr{break-inside:avoid}}
  </style></head><body><main><header><h1>${escape(restaurant.name)}</h1><p>${escape(restaurant.address)}</p>${restaurant.phone ? `<p>${escape(restaurant.phone)}</p>` : ""}<h2>Payment receipt ${number}</h2><p>Customer: ${escape(session.customerName)}</p><p>${escape(new Intl.DateTimeFormat("en-IN", { timeZone: IST, dateStyle: "medium", timeStyle: "short" }).format(paidAt))} (${escape("IST")})</p><p class="paid">PAID · ${escape(session.paymentMethod === "CASH" ? "Cash" : session.paymentMethod || "Payment method not recorded")}</p></header>
  ${orders.map((o) => `<h2>Order #${o.orderNumber}</h2><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody>${o.items.map((i) => `<tr><td>${escape(i.itemNameSnapshot)}</td><td>${i.quantity}</td><td>${money(i.priceSnapshot)}</td><td>${money(i.total)}</td></tr>`).join("")}</tbody></table>`).join("")}
  <div class="total"><span>Total paid</span><span>${money(total)}</span></div><footer>Payment confirmed by the restaurant. Thank you for visiting!<br>This is a payment receipt, not a tax invoice. Open this file in your browser to print or save as PDF.</footer></main></body></html>`;
}

import { IST } from "../lib/time";
import PDFDocument from "pdfkit";
import path from "node:path";

export const localDateKey = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function reportPeriod(days: number, timezone: string, now = new Date()) {
  const end = localDateKey(now, timezone);
  const date = new Date(`${end}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return {
    start: date.toISOString().slice(0, 10),
    end,
    queryStart: new Date(date.getTime() - 86400000),
  };
}
export type TransactionRow = {
  customerName: string;
  paidAt: Date;
  paymentMethod: string | null;
  orderNumbers: string[];
  amount: number;
};
export async function transactionPdf(
  restaurant: { name: string; currency: string; timezone: string },
  period: { start: string; end: string },
  rows: TransactionRow[],
) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
    info: {
      Title: `${restaurant.name} - Transaction report`,
      Author: restaurant.name,
    },
  });
  doc.registerFont(
    "Report",
    path.join(process.cwd(), "public/fonts/NotoSans-Regular.ttf"),
  );
  doc.font("Report");
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const money = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: restaurant.currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
    }).format(value);
  const total = rows.reduce((n, r) => n + Math.round(r.amount * 100), 0) / 100;
  const text = (
    value: string,
    x: number,
    y: number,
    width: number,
    size = 9,
    align: "left" | "right" = "left",
  ) =>
    doc
      .font("Report")
      .fontSize(size)
      .fillColor("#243d31")
      .text(value, x, y, { width, align, lineGap: 2 });
  let y = 40;
  text(restaurant.name, 40, y, 515, 21);
  y = doc.y + 12;
  text("Transaction report", 40, y, 515, 16);
  y = doc.y + 8;
  text(
    `${period.start} to ${period.end}  |  IST`,
    40,
    y,
    515,
    10,
  );
  y = doc.y + 6;
  text(
    "Based on payment confirmation dates. Cancelled orders and unpaid visits are excluded.",
    40,
    y,
    515,
    9,
  );
  y = doc.y + 20;
  doc.roundedRect(40, y, 515, 57, 6).fill("#edf3e7");
  text(`${rows.length} paid transactions`, 54, y + 10, 245, 10);
  text(`Total received: ${money(total)}`, 54, y + 28, 485, 13);
  y += 74;
  for (const method of ["UPI", "CASH", null]) {
    const matching = rows.filter((r) => r.paymentMethod === method);
    const sum =
      matching.reduce((n, r) => n + Math.round(r.amount * 100), 0) / 100;
    text(
      `${method === "CASH" ? "Cash" : method || "Not recorded"}  -  ${matching.length} transactions`,
      40,
      y,
      300,
      10,
    );
    text(money(sum), 345, y, 210, 10, "right");
    y += 23;
  }
  y += 16;
  const header = () => {
    doc.rect(40, y, 515, 28).fill("#234b3c");
    for (const [label, x, width] of [
      ["Payment date", 48, 90],
      ["Customer / orders", 146, 214],
      ["Method", 366, 64],
      ["Amount", 438, 109],
    ] as const)
      doc
        .fontSize(9)
        .fillColor("white")
        .text(label, x, y + 8, {
          width,
          align: label === "Amount" ? "right" : "left",
        });
    y += 34;
  };
  const next = () => {
    doc.addPage();
    text(`${restaurant.name} - Transactions`, 40, 35, 515, 11);
    y = 63;
    header();
  };
  header();
  if (!rows.length) {
    text("No payments were confirmed during this period.", 48, y + 12, 490, 11);
  }
  for (const row of rows) {
    const date = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(row.paidAt);
    const customer = `${row.customerName}\n${row.orderNumbers.map((n) => `#${n}`).join(", ")}`;
    doc.fontSize(9);
    const height = Math.max(
      44,
      doc.heightOfString(customer, { width: 208, lineGap: 2 }) + 18,
      doc.heightOfString(date, { width: 90, lineGap: 2 }) + 18,
    );
    if (y + height > 775) next();
    // A visit can have many orders. Split unusually tall rows into safe chunks.
    if (height > 670) {
      for (let offset = 0; offset < row.orderNumbers.length; offset += 80) {
        const part = {
          ...row,
          orderNumbers: row.orderNumbers.slice(offset, offset + 80),
        };
        const content = `${part.customerName}${offset ? " (continued)" : ""}\n${part.orderNumbers.map((n) => `#${n}`).join(", ")}`;
        const h = Math.max(
          44,
          doc.heightOfString(content, { width: 208, lineGap: 2 }) + 18,
        );
        if (y + h > 775) next();
        text(date, 48, y + 6, 90);
        text(content, 146, y + 6, 208);
        if (!offset) {
          text(
            row.paymentMethod === "CASH"
              ? "Cash"
              : row.paymentMethod || "Not recorded",
            366,
            y + 6,
            64,
          );
          text(money(row.amount), 438, y + 6, 109, 9, "right");
        }
        y += h;
        doc
          .moveTo(40, y - 3)
          .lineTo(555, y - 3)
          .strokeColor("#dce2d5")
          .stroke();
      }
    } else {
      text(date, 48, y + 6, 90);
      text(customer, 146, y + 6, 208);
      text(
        row.paymentMethod === "CASH"
          ? "Cash"
          : row.paymentMethod || "Not recorded",
        366,
        y + 6,
        64,
      );
      text(money(row.amount), 438, y + 6, 109, 9, "right");
      y += height;
      doc
        .moveTo(40, y - 3)
        .lineTo(555, y - 3)
        .strokeColor("#dce2d5")
        .stroke();
    }
  }
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(index);
    text(
      "Payment records confirmed by staff. Not a tax invoice.",
      40,
      782,
      400,
      8,
    );
    text(`${index + 1} / ${pages.count}`, 455, 782, 100, 8, "right");
  }
  doc.end();
  return output;
}

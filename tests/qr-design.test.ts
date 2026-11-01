import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { qrCustomizationSchema, scannableInk } from "../src/lib/qr-design";
import { restaurantQR } from "../src/server/qr-design";
import {
  isQRColor,
  isQRTemplate,
  qrColors,
  qrTemplates,
} from "../src/lib/qr-design";

describe("restaurant QR artwork", () => {
  it("renders arbitrary colors and escaped custom copy while bounding rendering inputs", async () => {
    expect(scannableInk("#ffff00")).toBe("#172027");
    expect(
      qrCustomizationSchema.safeParse({ accent: "url(evil)" }).success,
    ).toBe(false);
    expect(qrCustomizationSchema.safeParse({ size: 999999 }).success).toBe(
      false,
    );
    expect(qrCustomizationSchema.safeParse({ radius: -1 }).success).toBe(false);
    expect(qrCustomizationSchema.safeParse({ font: "<svg>" }).success).toBe(
      false,
    );
    const png = await restaurantQR({
      name: "Custom Bistro",
      url: "https://example.com/r/bistro",
      template: "bold",
      color: "forest",
      poster: true,
      customization: {
        accent: "#ffd100",
        background: "#0c2244",
        heading: "Eat & enjoy <today>",
        subtitle: "Made for you",
        size: 500,
        border: 60,
        radius: 90,
        font: "serif",
      },
    });
    expect(await sharp(png).metadata()).toMatchObject({
      width: 1000,
      height: 1400,
    });
  });
  it("allows only supported styles and dark, high-contrast colors", () => {
    expect(isQRColor("#ffffff")).toBe(false);
    expect(isQRTemplate(["classic"])).toBe(false);
    expect(isQRTemplate("<svg>")).toBe(false);
    for (const { value } of qrColors) {
      const rgb = value
        .slice(1)
        .match(/../g)!
        .map((v) => parseInt(v, 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      expect(
        1.05 / (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 + 0.05),
      ).toBeGreaterThan(7);
    }
  });
  it("renders each template with escaped restaurant names and consistent printable dimensions", async () => {
    const designs: Buffer[] = [];
    for (const { id } of qrTemplates) {
      const png = await restaurantQR({
        name: 'A & B <Kitchen> "Restaurant"',
        url: "https://example.com/r/a-b",
        template: id,
        color: "forest",
        poster: true,
      });
      expect(await sharp(png).metadata()).toMatchObject({
        format: "png",
        width: 1000,
        height: 1400,
      });
      designs.push(png);
    }
    expect(
      new Set(designs.map((buffer) => buffer.toString("base64"))).size,
    ).toBe(3);
  });
  it("keeps a white quiet zone and changes code content only with the menu URL", async () => {
    const options = {
      name: "Bistro",
      url: "https://example.com/r/bistro",
      template: "classic" as const,
      color: "navy" as const,
      poster: false,
    };
    const code = await restaurantQR(options);
    expect(
      code.equals(
        await restaurantQR({ ...options, name: "Renamed", template: "bold" }),
      ),
    ).toBe(true);
    expect(
      code.equals(
        await restaurantQR({
          ...options,
          url: "https://example.com/r/another",
        }),
      ),
    ).toBe(false);
    const { data } = await sharp(code)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 3)]).toEqual([255, 255, 255]);
  });
});

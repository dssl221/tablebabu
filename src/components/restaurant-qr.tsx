"use client";
import { useEffect, useState } from "react";
import type { Restaurant } from "@/lib/types";
import {
  defaultQRCustomization,
  qrCustomizationSchema,
  type QRCustomization,
  qrColors,
  qrTemplates,
  isQRColor,
  isQRTemplate,
  type QRColor,
  type QRTemplate,
} from "@/lib/qr-design";
import { SectionTitle } from "./ui";
import s from "./restaurant-qr.module.css";

export function RestaurantQR({ restaurant }: { restaurant: Restaurant }) {
  const [template, setTemplate] = useState<QRTemplate>("classic");
  const [color, setColor] = useState<QRColor>("forest");
  const [design, setDesign] = useState(defaultQRCustomization);
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState("");
  const [failed, setFailed] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const storageKey = `tablebabu:qr-design:${restaurant.id}`;
  useEffect(() => {
    setStorageReady(false);
    setDesign(defaultQRCustomization);
    setTemplate("classic");
    setColor("forest");
    try {
      const preference = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const restored = qrCustomizationSchema.safeParse(preference.design || {});
      if (restored.success) setDesign(restored.data);
      if (isQRTemplate(preference.template)) setTemplate(preference.template);
      if (isQRColor(preference.color)) setColor(preference.color);
    } catch {
      /* Storage may be disabled. Designing and downloading still work. */
    }
    setStorageReady(true);
  }, [storageKey]);
  const select = (nextTemplate: QRTemplate, nextColor: QRColor) => {
    setTemplate(nextTemplate);
    setColor(nextColor);
    const nextDesign = {
      ...design,
      accent:
        nextTemplate !== template
          ? design.accent
          : qrColors.find((c) => c.id === nextColor)!.value,
      border:
        nextTemplate !== template
          ? nextTemplate === "frame"
            ? 30
            : 0
          : design.border,
    };
    setDesign(nextDesign);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          template: nextTemplate,
          color: nextColor,
          design: nextDesign,
        }),
      );
    } catch {
      /* Optional convenience only. */
    }
  };
  const updateDesign = (patch: Partial<QRCustomization>) => {
    const next = { ...design, ...patch };
    setDesign(next);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ template, color, design: next }),
      );
    } catch {}
  };
  const desiredQuery = new URLSearchParams({
    template,
    color,
    ...Object.fromEntries(
      Object.entries(design).map(([key, value]) => [key, String(value)]),
    ),
  }).toString();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(desiredQuery), 350);
    return () => clearTimeout(timer);
  }, [desiredQuery]);
  const image = `/api/qr?poster=1&${query}&themeVersion=${encodeURIComponent(restaurant.festivalTheme || "none")}`;
  const ready = query === desiredQuery && loaded === image && failed !== image;
  return (
    <>
      <SectionTitle
        eyebrow="YOUR RESTAURANT QR"
        title="Make it yours"
        description="Choose a look that belongs in your restaurant. Every design opens the same menu."
      />
      <div className={s.layout}>
        <section className={s.controls} aria-label="QR design options">
          <fieldset disabled={!storageReady}>
            <legend>1. Start with a layout</legend>
            <div className={s.templates}>
              {qrTemplates.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  aria-pressed={template === entry.id}
                  className={s.template}
                  onClick={() => select(entry.id, color)}
                >
                  <span
                    className={`${s.mini} ${s[entry.id]}`}
                    aria-hidden="true"
                  >
                    <span>YOUR RESTAURANT</span>
                    <b>▦</b>
                    <small>SCAN TO ORDER</small>
                  </span>
                  <strong>{entry.name}</strong>
                  <span>{entry.description}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={!storageReady}>
            <legend>2. Choose any color</legend>
            {restaurant.festivalTheme &&
              restaurant.festivalTheme !== "none" && (
                <p>
                  Your saved festival theme controls the QR colors and greeting.
                  Change it in Restaurant settings to use these custom colors
                  again.
                </p>
              )}
            <div className={s.colors}>
              {qrColors.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  aria-pressed={design.accent.toLowerCase() === entry.value}
                  onClick={() => select(template, entry.id)}
                >
                  <span
                    style={{ background: entry.value }}
                    aria-hidden="true"
                  />
                  {entry.name}
                </button>
              ))}
            </div>
            <p>
              Print-friendly colors with a clear white space around the QR for
              reliable scanning.
            </p>
          </fieldset>
          <fieldset disabled={!storageReady} className={s.customize}>
            <legend>3. Design your own</legend>
            <label>
              Accent color
              <input
                type="color"
                value={design.accent}
                onChange={(e) => updateDesign({ accent: e.target.value })}
              />
            </label>
            <label>
              Background color
              <input
                type="color"
                value={design.background}
                onChange={(e) => updateDesign({ background: e.target.value })}
              />
            </label>
            <p>
              Use any color. Light accents automatically use dark QR ink on
              white to keep the code readable.
            </p>
            <label>
              Headline
              <input
                maxLength={36}
                value={design.heading}
                onChange={(e) => updateDesign({ heading: e.target.value })}
              />
            </label>
            <label>
              Supporting text
              <input
                maxLength={60}
                value={design.subtitle}
                onChange={(e) => updateDesign({ subtitle: e.target.value })}
              />
            </label>
            <label>
              Typography
              <select
                aria-label="Typography"
                value={design.font}
                onChange={(e) =>
                  updateDesign({
                    font: e.target.value as QRCustomization["font"],
                  })
                }
              >
                <option value="sans-serif">Modern</option>
                <option value="serif">Editorial</option>
                <option value="monospace">Typewriter</option>
              </select>
            </label>
            <label>
              Border width: {design.border}
              <input
                type="range"
                min="0"
                max="70"
                value={design.border}
                onChange={(e) =>
                  updateDesign({ border: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Corner rounding: {design.radius}
              <input
                type="range"
                min="0"
                max="120"
                value={design.radius}
                onChange={(e) =>
                  updateDesign({ radius: Number(e.target.value) })
                }
              />
            </label>
            <label>
              QR size: {design.size}
              <input
                type="range"
                min="500"
                max="720"
                value={design.size}
                onChange={(e) => updateDesign({ size: Number(e.target.value) })}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              onClick={() => updateDesign(defaultQRCustomization)}
            >
              Reset custom design
            </button>
          </fieldset>
          <div className={s.actions}>
            {ready ? (
              <a
                className="button primary"
                href={`${image}&download=1`}
                download
              >
                Download design PNG
              </a>
            ) : (
              <button className="button primary" disabled>
                Preparing design…
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              disabled={!ready}
              onClick={() => window.print()}
            >
              Print design
            </button>
          </div>
          <a
            className="text-link"
            href={`/api/qr?${desiredQuery}&download=1`}
            download
          >
            Download QR only
          </a>
          <p className={s.note}>
            Your choice is remembered in this browser. Use the same QR on
            tables, at the counter, or by your entrance. Test one printed copy
            with a phone before printing a batch.
          </p>
          <a
            href={`/r/${restaurant.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
          >
            Open your customer menu ↗
          </a>
        </section>
        <section className={s.preview} aria-label="Live QR preview">
          <div className={s.previewLabel}>
            <strong>Live preview</strong>
            <span>
              {qrTemplates.find((t) => t.id === template)?.name} ·{" "}
              {design.accent}
            </span>
          </div>
          <div id="print-qr" className={s.printCard}>
            <img
              key={image}
              src={image}
              width={1000}
              height={1400}
              alt={`${restaurant.name} QR poster, ${template} design in ${color}`}
              onLoad={() => {
                setLoaded(image);
                setFailed("");
              }}
              onError={() => setFailed(image)}
            />
          </div>
          <p role="status">
            {failed === image
              ? "Preview could not load. Choose a design again or refresh the page."
              : ready
                ? "Your download and print will match this preview."
                : "Preparing your preview…"}
          </p>
        </section>
      </div>
    </>
  );
}

"use client";
import { useState } from "react";
import {
  festivalIds,
  festivalTheme,
  type FestivalId,
} from "@/lib/festival-themes";
export function FestivalPicker({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange?: (value: FestivalId) => void;
  name?: string;
}) {
  const [selected, setSelected] = useState(value || "none");
  const current = onChange ? value : selected;
  const theme = festivalTheme(current);
  return (
    <fieldset className="festival-picker">
      <legend>Seasonal design</legend>
      <label>
        Festival theme
        <select
          aria-label="Festival theme"
          name={name}
          value={current}
          onChange={(e) => {
            setSelected(e.target.value);
            onChange?.(e.target.value as FestivalId);
          }}
        >
          {festivalIds.map((id) => (
            <option key={id} value={id}>
              {festivalTheme(id).name}
            </option>
          ))}
        </select>
      </label>
      <div
        className="festival-sample"
        style={{
          background: theme.background,
          color: theme.accent,
          borderColor: theme.accent,
        }}
      >
        <span aria-hidden="true">{theme.motif}</span>
        <strong>{theme.greeting || "Your everyday branding"}</strong>
        <p>Fresh favourites. A warm welcome.</p>
      </div>
      <p className="muted text-sm">
        Choose Everyday to restore your usual branding. Themes stay active until
        you change them.
      </p>
    </fieldset>
  );
}

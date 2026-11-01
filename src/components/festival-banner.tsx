import { festivalTheme } from "@/lib/festival-themes";
export function FestivalBanner({ theme }: { theme?: string }) {
  const design = festivalTheme(theme);
  if (!design.greeting) return null;
  return (
    <div
      className="festival-banner"
      style={{
        color: design.accent,
        background: design.background,
        borderColor: design.highlight,
      }}
    >
      <span aria-hidden="true">
        {design.motif} {design.motif} {design.motif}
      </span>
      <strong>{design.greeting}</strong>
      <span aria-hidden="true">
        {design.motif} {design.motif} {design.motif}
      </span>
    </div>
  );
}

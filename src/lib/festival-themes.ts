export const festivalIds = [
  "none",
  "diwali",
  "durga-puja",
  "holi",
  "eid",
  "christmas",
  "new-year",
] as const;
export type FestivalId = (typeof festivalIds)[number];
export const festivalThemes = {
  none: {
    name: "Everyday",
    greeting: "",
    motif: "",
    accent: "#234b3c",
    background: "#ffffff",
    highlight: "#dcf58a",
  },
  diwali: {
    name: "Diwali",
    greeting: "Celebrate the festival of lights",
    motif: "✦",
    accent: "#8c3816",
    background: "#fff6e5",
    highlight: "#ffd17a",
  },
  "durga-puja": {
    name: "Durga Puja",
    greeting: "Shubho Sharodiya",
    motif: "❋",
    accent: "#982e35",
    background: "#fff4e9",
    highlight: "#f6c3ad",
  },
  holi: {
    name: "Holi",
    greeting: "A celebration of colour and flavour",
    motif: "✺",
    accent: "#86265d",
    background: "#fff0f6",
    highlight: "#f8bbdf",
  },
  eid: {
    name: "Eid",
    greeting: "Eid Mubarak",
    motif: "☾",
    accent: "#17584b",
    background: "#eef8f0",
    highlight: "#d8eab0",
  },
  christmas: {
    name: "Christmas",
    greeting: "Season’s greetings",
    motif: "✧",
    accent: "#8e3038",
    background: "#fff4f3",
    highlight: "#e9c1c3",
  },
  "new-year": {
    name: "New Year",
    greeting: "Here’s to a delicious new year",
    motif: "✷",
    accent: "#393365",
    background: "#f5f2ff",
    highlight: "#dbd0fc",
  },
} satisfies Record<
  FestivalId,
  {
    name: string;
    greeting: string;
    motif: string;
    accent: string;
    background: string;
    highlight: string;
  }
>;
export function festivalTheme(value: string | undefined) {
  return festivalThemes[
    festivalIds.includes(value as FestivalId) ? (value as FestivalId) : "none"
  ];
}

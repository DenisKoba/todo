export const LIST_COLORS = [
  { key: "neutral", base: "#FFFFFF", labelKey: "colorNeutral" },
  { key: "coral", base: "#F5B8AF", labelKey: "colorCoral" },
  { key: "peach", base: "#F5C9A7", labelKey: "colorPeach" },
  { key: "butter", base: "#F4DF9B", labelKey: "colorButter" },
  { key: "sage", base: "#BBD8BD", labelKey: "colorSage" },
  { key: "sky", base: "#B7D6ED", labelKey: "colorSky" },
  { key: "lavender", base: "#D3C6EE", labelKey: "colorLavender" },
] as const;

export type ListColorKey = (typeof LIST_COLORS)[number]["key"];
export const DEFAULT_LIST_COLOR: ListColorKey = "neutral";

export function getListColor(key: string | null | undefined) {
  return LIST_COLORS.find((color) => color.key === key) ?? LIST_COLORS[0];
}

function mixWithWhite(hex: string, whiteWeight: number): `#${string}` {
  const rgb = [1, 3, 5].map((offset) =>
    Math.round(
      Number.parseInt(hex.slice(offset, offset + 2), 16) * (1 - whiteWeight) +
        255 * whiteWeight,
    ),
  );
  return `#${rgb.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

/** One palette swatch determines the whole page; neutral keeps the original UI. */
export function getListGradient(key: string | null | undefined) {
  const color = getListColor(key);
  if (color.key === DEFAULT_LIST_COLOR) return null;
  return [
    mixWithWhite(color.base, 0.72),
    mixWithWhite(color.base, 0.3),
    mixWithWhite(color.base, 0.58),
  ] as const;
}

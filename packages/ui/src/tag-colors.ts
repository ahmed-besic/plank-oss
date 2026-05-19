const DEFAULT_TAG_COLOR_KEY = "violet";

export interface TagColorOption {
  key: string;
  label: string;
  swatch: string;
}

export const TAG_COLOR_PALETTE: TagColorOption[] = [
  { key: "slate", label: "Slate", swatch: "#94A3B8" },
  { key: "gray", label: "Gray", swatch: "#9CA3AF" },
  { key: "red", label: "Red", swatch: "#F87171" },
  { key: "orange", label: "Orange", swatch: "#FB923C" },
  { key: "amber", label: "Amber", swatch: "#FBBF24" },
  { key: "yellow", label: "Yellow", swatch: "#FACC15" },
  { key: "lime", label: "Lime", swatch: "#A3E635" },
  { key: "green", label: "Green", swatch: "#4ADE80" },
  { key: "emerald", label: "Emerald", swatch: "#34D399" },
  { key: "teal", label: "Teal", swatch: "#2DD4BF" },
  { key: "cyan", label: "Cyan", swatch: "#22D3EE" },
  { key: "blue", label: "Blue", swatch: "#60A5FA" },
  { key: "indigo", label: "Indigo", swatch: "#818CF8" },
  { key: "violet", label: "Violet", swatch: "#A78BFA" },
];

const tagColorOptionByKey = new Map(
  TAG_COLOR_PALETTE.map((option) => [option.key, option]),
);

function expandHex(hex: string) {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

function hexToRgb(hex: string) {
  const normalized = expandHex(hex.trim());
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  const value = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgba(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function getTagColorOption(color?: string | null): TagColorOption {
  if (color) {
    const byKey = tagColorOptionByKey.get(color);
    if (byKey) {
      return byKey;
    }
    if (hexToRgb(color)) {
      return {
        key: color,
        label: "Custom",
        swatch: color,
      };
    }
  }

  return (
    tagColorOptionByKey.get(DEFAULT_TAG_COLOR_KEY) ?? TAG_COLOR_PALETTE[0]!
  );
}

export function getTagDotStyle(color?: string | null) {
  return {
    backgroundColor: getTagColorOption(color).swatch,
  };
}

export function getTagChipStyle(
  color?: string | null,
  options?: { selected?: boolean },
) {
  const swatch = getTagColorOption(color).swatch;
  if (options?.selected) {
    return {
      backgroundColor: rgba(swatch, 0.24),
      borderColor: rgba(swatch, 0.42),
      color: swatch,
    };
  }

  return {
    backgroundColor: rgba(swatch, 0.14),
    borderColor: rgba(swatch, 0.24),
    color: swatch,
  };
}


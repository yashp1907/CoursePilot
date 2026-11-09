/** Course colors: a curated palette (named so themes can evolve) plus any custom #rrggbb. */
export const COURSE_COLORS = ["blue", "indigo", "violet", "rose", "red", "orange", "amber", "green", "teal", "cyan", "slate", "brown"] as const;
export type CourseColor = (typeof COURSE_COLORS)[number];

const HEX: Record<string, string> = {
  blue: "#3b6cf0", indigo: "#5558e3", violet: "#8a5cf6", rose: "#e0457b", red: "#e0483c", orange: "#ee7a2b",
  amber: "#d99a06", green: "#2f9e5b", teal: "#0f9d8f", cyan: "#0d94c4", slate: "#64748b", brown: "#8d6244",
};

export const COLOR_LABEL: Record<string, string> = { blue: "Blue", indigo: "Indigo", violet: "Violet", rose: "Rose", red: "Red", orange: "Orange", amber: "Amber", green: "Green", teal: "Teal", cyan: "Cyan", slate: "Slate", brown: "Brown" };

const HEX_RE = /^#[0-9a-f]{6}$/i;
export const isValidCourseColor = (v: unknown): v is string => typeof v === "string" && ((COURSE_COLORS as readonly string[]).includes(v) || HEX_RE.test(v));

/** Resolve a stored color (name or #hex) to a hex value. Unknown values fall back to blue. */
export function courseHex(c: string | null | undefined): string {
  if (!c) return HEX.blue;
  if (HEX_RE.test(c)) return c.toLowerCase();
  return HEX[c] ?? HEX.blue;
}

/** A translucent wash of the color for backgrounds (works on light and dark surfaces). */
export const tint = (c: string | null | undefined, pct = 12) => `color-mix(in srgb, ${courseHex(c)} ${pct}%, transparent)`;
/** Text in the course color, blended toward the theme's foreground so it stays readable on light AND dark. */
export const readable = (c: string | null | undefined) => `color-mix(in oklab, ${courseHex(c)} 62%, var(--foreground))`;

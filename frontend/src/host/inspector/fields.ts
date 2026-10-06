import type { LiveValues } from "../../protocol/messages";

export const MIXED = "Mixed";
export const NONE = "—";

export const LIVE_FIELDS = [
  "Name",
  "Tag",
  "ID",
  "Classes",
  "Size",
  "Position",
  "Text",
  "Text colour",
  "Background",
  "Font family",
  "Font size",
  "Font weight",
] as const;

export type LiveField = (typeof LIVE_FIELDS)[number];
export type LiveRows = Record<LiveField, string>;

const orNone = (s: string) => (s.trim() ? s : NONE);

export function formatLive(v: LiveValues): LiveRows {
  return {
    Name: v.name,
    Tag: v.tag,
    ID: orNone(v.id),
    Classes: v.classes.length ? v.classes.join(" ") : NONE,
    Size: `${v.width} × ${v.height}`,
    Position: `${v.x}, ${v.y}`,
    Text: orNone(v.text),
    "Text colour": v.color,
    Background: v.background,
    "Font family": v.fontFamily,
    "Font size": v.fontSize,
    "Font weight": v.fontWeight,
  };
}

/** Each field is the value every element shares, else "Mixed" (R5.2). */
export function mergeLive(list: LiveRows[]): LiveRows {
  const out = {} as LiveRows;
  for (const f of LIVE_FIELDS) {
    const first = list[0]?.[f] ?? NONE;
    out[f] = list.every((r) => r[f] === first) ? first : MIXED;
  }
  return out;
}

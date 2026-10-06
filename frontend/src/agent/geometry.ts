import type { Geometry, Rect } from "../protocol/messages";
import { nameOf } from "./naming";

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  // `<` (not `<=`) keeps zero-size elements that sit inside the clip.
  if (right < x || bottom < y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

const toRect = (r: DOMRect): Rect => ({ x: r.left, y: r.top, width: r.width, height: r.height });

/**
 * Element box plus the region it is visible through: the viewport intersected
 * with every ancestor that clips overflow (inner scroll areas, D14). null when
 * the element is scrolled fully out of view.
 */
export function geometryOf(el: Element, doc: Document): Geometry | null {
  const view = doc.defaultView!;
  const rect = toRect(el.getBoundingClientRect());
  let clip: Rect | null = { x: 0, y: 0, width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight };
  for (let a = el.parentElement; a && clip && a !== doc.body && a !== doc.documentElement; a = a.parentElement) {
    const cs = view.getComputedStyle(a);
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
      const ar = a.getBoundingClientRect();
      clip = intersect(clip, { x: ar.left + a.clientLeft, y: ar.top + a.clientTop, width: a.clientWidth, height: a.clientHeight });
    }
  }
  if (!clip || !intersect(clip, rect)) return null;
  return { rect, clip, name: nameOf(el) };
}

/** Stable string for change detection (sub-pixel noise rounded away). */
export function geometryKey(g: Geometry | null): string {
  if (!g) return "null";
  const r = (n: number) => Math.round(n * 100) / 100;
  const { rect: a, clip: c } = g;
  return `${r(a.x)},${r(a.y)},${r(a.width)},${r(a.height)}|${r(c.x)},${r(c.y)},${r(c.width)},${r(c.height)}|${g.name}`;
}

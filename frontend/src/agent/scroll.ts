// Page scrolling driven by the host. Never uses scrollIntoView: it also scrolls
// ancestor frames, which would move the host board (R4.6).

function scrollable(el: Element, view: Window): { x: boolean; y: boolean } {
  const cs = view.getComputedStyle(el);
  const can = (o: string) => o === "auto" || o === "scroll";
  return {
    x: can(cs.overflowX) && el.scrollWidth > el.clientWidth,
    y: can(cs.overflowY) && el.scrollHeight > el.clientHeight,
  };
}

function canMove(el: Element, dx: number, dy: number): boolean {
  if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
  if (dy < 0 && el.scrollTop > 0) return true;
  if (dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
  if (dx < 0 && el.scrollLeft > 0) return true;
  return false;
}

/** Emulates a wheel at (x, y): scroll the innermost scroller that can still move, else the page (R1.4). */
export function wheelAt(doc: Document, x: number, y: number, dx: number, dy: number): void {
  const view = doc.defaultView!;
  for (let el = doc.elementFromPoint(x, y); el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    const s = scrollable(el, view);
    const mx = s.x ? dx : 0;
    const my = s.y ? dy : 0;
    if ((mx || my) && canMove(el, mx, my)) {
      el.scrollBy({ left: mx, top: my });
      return;
    }
  }
  view.scrollBy({ left: dx, top: dy });
}

/** Minimal scroll delta that brings [start, end] inside [0, size]; aligns start when it can't fit. */
export function nearestDelta(start: number, end: number, size: number): number {
  if (start < 0) return start;
  if (end > size) return Math.min(end - size, start);
  return 0;
}

/** Bring an element into view by adjusting only this document's scrollers. */
export function scrollToElement(el: Element, doc: Document): void {
  const view = doc.defaultView!;
  for (let a = el.parentElement; a && a !== doc.body && a !== doc.documentElement; a = a.parentElement) {
    const s = scrollable(a, view);
    if (!s.x && !s.y) continue;
    const ar = a.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const top = ar.top + a.clientTop;
    const left = ar.left + a.clientLeft;
    if (s.y) a.scrollTop += nearestDelta(r.top - top, r.bottom - top, a.clientHeight);
    if (s.x) a.scrollLeft += nearestDelta(r.left - left, r.right - left, a.clientWidth);
  }
  const r = el.getBoundingClientRect();
  const de = doc.documentElement;
  view.scrollBy({ top: nearestDelta(r.top, r.bottom, de.clientHeight), left: nearestDelta(r.left, r.right, de.clientWidth) });
}

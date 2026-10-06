import type { LiveValues } from "../protocol/messages";
import { nameOf } from "./naming";

/** Live inspector values read straight from the page (R5.1). Position is in document coordinates (D13.8). */
export function liveValues(el: Element, doc: Document): LiveValues {
  const view = doc.defaultView!;
  const cs = view.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    name: nameOf(el),
    tag: el.tagName.toLowerCase(),
    id: el.getAttribute("id") ?? "",
    classes: Array.from(el.classList),
    key: el.getAttribute("data-key"),
    width: Math.round(r.width),
    height: Math.round(r.height),
    x: Math.round(r.left + view.scrollX),
    y: Math.round(r.top + view.scrollY),
    text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
    color: cs.color,
    background: cs.backgroundColor,
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
  };
}

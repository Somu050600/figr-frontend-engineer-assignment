/** Element name per the brief: data-name → tag.firstClass → tag#id → tag. */
export function nameOf(el: Element): string {
  const dataName = el.getAttribute("data-name");
  if (dataName) return dataName;
  const tag = el.tagName.toLowerCase();
  // getAttribute, not className: SVG elements expose className as SVGAnimatedString.
  const firstClass = (el.getAttribute("class") ?? "").trim().split(/\s+/)[0];
  if (firstClass) return `${tag}.${firstClass}`;
  const id = el.getAttribute("id");
  if (id) return `${tag}#${id}`;
  return tag;
}

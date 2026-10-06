// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { nameOf } from "./naming";

function el(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

describe("nameOf", () => {
  it("prefers data-name", () => {
    expect(nameOf(el(`<button class="primary" id="x" data-name="Get started"></button>`))).toBe("Get started");
  });
  it("uses tag plus first class", () => {
    expect(nameOf(el(`<button class="primary big" id="x"></button>`))).toBe("button.primary");
  });
  it("falls back to tag plus id", () => {
    expect(nameOf(el(`<div id="hero"></div>`))).toBe("div#hero");
  });
  it("falls back to the tag", () => {
    expect(nameOf(el(`<section></section>`))).toBe("section");
  });
  it("ignores blank class attributes", () => {
    expect(nameOf(el(`<span class="   " id="t"></span>`))).toBe("span#t");
  });
  it("handles SVG elements", () => {
    const svg = el(`<svg viewBox="0 0 1 1"><path class="stroke"></path></svg>`);
    expect(nameOf(svg)).toBe("svg");
    expect(nameOf(svg.firstElementChild!)).toBe("path.stroke");
  });
});

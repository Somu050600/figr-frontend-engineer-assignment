import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, zoomAt } from "./viewport";

describe("zoomAt", () => {
  it("keeps the board point under the pointer fixed", () => {
    const v = { x: 100, y: 50, zoom: 1 };
    const px = 400;
    const py = 300;
    const before = { x: (px - v.x) / v.zoom, y: (py - v.y) / v.zoom };
    const n = zoomAt(v, px, py, 1.7);
    expect((px - n.x) / n.zoom).toBeCloseTo(before.x);
    expect((py - n.y) / n.zoom).toBeCloseTo(before.y);
  });

  it("clamps to 25%–400%", () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 100).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0, 0, 0.001).zoom).toBe(MIN_ZOOM);
  });

  it("does not drift when already clamped", () => {
    const v = { x: 10, y: 20, zoom: MAX_ZOOM };
    expect(zoomAt(v, 300, 300, 2)).toEqual(v);
  });
});

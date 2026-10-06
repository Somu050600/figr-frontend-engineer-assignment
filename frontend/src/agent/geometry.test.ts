import { describe, expect, it } from "vitest";
import { geometryKey, intersect } from "./geometry";
import { nearestDelta } from "./scroll";

describe("intersect", () => {
  it("returns the overlap", () => {
    expect(intersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toEqual({ x: 5, y: 5, width: 5, height: 5 });
  });
  it("returns null when disjoint", () => {
    expect(intersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 5, height: 5 })).toBeNull();
  });
  it("keeps zero-size boxes inside the clip", () => {
    expect(intersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 3, y: 3, width: 0, height: 0 })).toEqual({ x: 3, y: 3, width: 0, height: 0 });
  });
});

describe("geometryKey", () => {
  it("ignores sub-pixel noise", () => {
    const g = (x: number) => ({ rect: { x, y: 0, width: 1, height: 1 }, clip: { x: 0, y: 0, width: 9, height: 9 }, name: "a" });
    expect(geometryKey(g(1.0001))).toBe(geometryKey(g(1.0002)));
    expect(geometryKey(g(1))).not.toBe(geometryKey(g(2)));
    expect(geometryKey(null)).toBe("null");
  });
});

describe("nearestDelta", () => {
  it("does nothing when already visible", () => expect(nearestDelta(10, 20, 100)).toBe(0));
  it("scrolls up to the start", () => expect(nearestDelta(-30, -10, 100)).toBe(-30));
  it("scrolls down just enough", () => expect(nearestDelta(110, 130, 100)).toBe(30));
  it("aligns the start of tall elements", () => expect(nearestDelta(50, 300, 100)).toBe(50));
});

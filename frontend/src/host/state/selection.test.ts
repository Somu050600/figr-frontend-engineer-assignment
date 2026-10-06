import { describe, expect, it } from "vitest";
import { applyClear, applyNavigated, applyRemoved, applySelect, emptySelection, lastSelected } from "./selection";

describe("selection reducers", () => {
  it("replaces and activates the preview", () => {
    const s = applySelect(emptySelection, "A", ["n1"], "replace");
    expect(s).toEqual({ activeScreenId: "A", screenId: "A", ids: ["n1"], goneNotice: false });
  });

  it("toggles within the same preview, most recent last", () => {
    let s = applySelect(emptySelection, "A", ["n1"], "replace");
    s = applySelect(s, "A", ["n2"], "toggle");
    s = applySelect(s, "A", ["n3"], "toggle");
    expect(s.ids).toEqual(["n1", "n2", "n3"]);
    expect(lastSelected(s)).toBe("n3");
    s = applySelect(s, "A", ["n2"], "toggle");
    expect(s.ids).toEqual(["n1", "n3"]);
  });

  it("shift+click in another preview replaces", () => {
    let s = applySelect(emptySelection, "A", ["n1"], "replace");
    s = applySelect(s, "B", ["m1"], "toggle");
    expect(s).toMatchObject({ activeScreenId: "B", screenId: "B", ids: ["m1"] });
  });

  it("clears but keeps the active preview", () => {
    const s = applyClear(applySelect(emptySelection, "A", ["n1"], "replace"));
    expect(s).toMatchObject({ activeScreenId: "A", ids: [], screenId: null });
  });

  it("drops removed ids and flags when nothing is left", () => {
    let s = applySelect(emptySelection, "A", ["n1"], "replace");
    s = applySelect(s, "A", ["n2"], "toggle");
    s = applyRemoved(s, "A", ["n1"]);
    expect(s).toMatchObject({ ids: ["n2"], goneNotice: false });
    s = applyRemoved(s, "A", ["n2"]);
    expect(s).toMatchObject({ ids: [], goneNotice: true, activeScreenId: "A" });
    expect(applySelect(s, "A", ["n9"], "replace").goneNotice).toBe(false);
  });

  it("ignores removals from other previews or unrelated ids", () => {
    const s = applySelect(emptySelection, "A", ["n1"], "replace");
    expect(applyRemoved(s, "B", ["n1"])).toBe(s);
    expect(applyRemoved(s, "A", ["n5"])).toBe(s);
  });

  it("navigation clears that preview's selection without the gone notice", () => {
    const s = applyNavigated(applySelect(emptySelection, "A", ["n1"], "replace"), "A");
    expect(s).toMatchObject({ ids: [], goneNotice: false, activeScreenId: "A" });
  });
});

import { describe, expect, it } from "vitest";
import type { NodeRef } from "../../protocol/messages";
import {
  applyRemoved,
  applyTreeChanged,
  arrowLeft,
  arrowRight,
  beginSearch,
  emptyLayers,
  endSearch,
  failLoad,
  finishLoad,
  highlightFor,
  isNodeRow,
  mergeReveal,
  needsLoad,
  ROOT,
  setExpanded,
  setSearchResult,
  startLoad,
  stepRow,
  visibleRows,
  type ScreenLayers,
} from "./model";

const ref = (id: string, parentId: string | null = null, hasChildren = false): NodeRef => ({
  id,
  name: `name-${id}`,
  tag: "div",
  hasChildren,
  parentId,
  key: null,
});

function loadedRoot(): ScreenLayers {
  let s = startLoad(emptyLayers(), ROOT, 1);
  s = finishLoad(s, ROOT, 1, [ref("a", null, true), ref("b")]);
  return s;
}

const ids = (s: ScreenLayers) => visibleRows(s).map((r) => (isNodeRow(r) ? r.id : `${r.kind}:${r.parent}`));

describe("child loading", () => {
  it("shows a loading row then the children", () => {
    const s = startLoad(emptyLayers(), ROOT, 1);
    expect(ids(s)).toEqual(["loading:root"]);
    expect(ids(finishLoad(s, ROOT, 1, [ref("a")]))).toEqual(["a"]);
  });

  it("collapse + re-expand while loading reuses the request: no duplicates", () => {
    let s = setExpanded(loadedRoot(), "a", true);
    s = startLoad(s, "a", 2);
    s = setExpanded(s, "a", false);
    s = setExpanded(s, "a", true);
    expect(startLoad(s, "a", 3)).toBe(s); // still owned by request 2
    s = finishLoad(s, "a", 3, [ref("x", "a")]); // a stray token never lands
    s = finishLoad(s, "a", 2, [ref("a1", "a"), ref("a2", "a")]);
    s = finishLoad(s, "a", 2, [ref("a1", "a"), ref("a2", "a")]); // duplicate reply ignored
    expect(ids(s)).toEqual(["a", "a1", "a2", "b"]);
  });

  it("fails the row and retries with a new token", () => {
    let s = setExpanded(loadedRoot(), "a", true);
    s = startLoad(s, "a", 2);
    s = failLoad(s, "a", 2);
    expect(ids(s)).toEqual(["a", "error:a", "b"]);
    expect(needsLoad(s, "a")).toBe(true);
    s = startLoad(s, "a", 3);
    expect(finishLoad(s, "a", 2, [ref("late", "a")])).toBe(s);
    s = finishLoad(s, "a", 3, [ref("a1", "a")]);
    expect(ids(s)).toEqual(["a", "a1", "b"]);
  });

  it("does not show children of collapsed rows", () => {
    let s = setExpanded(loadedRoot(), "a", true);
    s = finishLoad(startLoad(s, "a", 2), "a", 2, [ref("a1", "a")]);
    expect(ids(setExpanded(s, "a", false))).toEqual(["a", "b"]);
  });
});

describe("page changes", () => {
  it("replaces a loaded parent's children and keeps expanded state", () => {
    let s = setExpanded(loadedRoot(), "a", true);
    s = finishLoad(startLoad(s, "a", 2), "a", 2, [ref("a1", "a")]);
    s = applyTreeChanged(s, ROOT, [ref("new"), ref("a", null, true), ref("b")]);
    expect(ids(s)).toEqual(["new", "a", "a1", "b"]);
  });

  it("ignores changes for parents never loaded", () => {
    const s = loadedRoot();
    expect(applyTreeChanged(s, "b", [ref("z", "b")])).toBe(s);
  });

  it("a tree change during loading settles the row and the late reply is ignored", () => {
    let s = setExpanded(loadedRoot(), "a", true);
    s = startLoad(s, "a", 2);
    s = applyTreeChanged(s, "a", [ref("a1", "a")]);
    s = finishLoad(s, "a", 2, [ref("a1", "a"), ref("old", "a")]);
    expect(ids(s)).toEqual(["a", "a1", "b"]);
  });

  it("prunes removed rows everywhere", () => {
    let s = setExpanded(loadedRoot(), "a", true);
    s = finishLoad(startLoad(s, "a", 2), "a", 2, [ref("a1", "a")]);
    s = applyRemoved(s, ["a"]);
    expect(ids(s)).toEqual(["b"]);
    expect(s.expanded).toEqual({});
    expect(s.children.a).toBeUndefined();
  });
});

describe("reveal", () => {
  it("loads and expands every ancestor level in one go", () => {
    const s = mergeReveal(emptyLayers(), [
      { id: null, children: [ref("m", null, true)] },
      { id: "m", children: [ref("l1", "m", true)] },
      { id: "l1", children: [ref("leaf", "l1")] },
    ]);
    expect(ids(s)).toEqual(["m", "l1", "leaf"]);
  });
});

describe("search", () => {
  it("shows matches with ancestors and restores the exact expanded state on clear", () => {
    let s = setExpanded(loadedRoot(), "a", true);
    s = beginSearch(s, "le");
    s = setExpanded(s, "zzz", true); // reveal during search
    s = setSearchResult(s, "le", [ref("m", null, true), ref("l1", "m", true), ref("leaf", "l1")], ["leaf"]);
    const rows = visibleRows(s).filter(isNodeRow);
    expect(rows.map((r) => [r.id, r.depth, r.match])).toEqual([
      ["m", 0, false],
      ["l1", 1, false],
      ["leaf", 2, true],
    ]);
    s = beginSearch(s, "lea"); // typing more keeps the original snapshot
    s = endSearch(s);
    expect(s.expanded).toEqual({ a: true });
    expect(s.search).toBeNull();
  });

  it("drops results for an outdated query", () => {
    const s = beginSearch(loadedRoot(), "new");
    expect(setSearchResult(s, "old", [ref("x")], ["x"])).toBe(s);
  });
});

describe("navigation helpers", () => {
  it("highlights the nearest visible ancestor", () => {
    const visible = new Set(["a", "b"]);
    expect(highlightFor("b", [], visible)).toBe("b");
    expect(highlightFor("deep", ["mid", "a"], visible)).toBe("a");
    expect(highlightFor("deep", ["mid"], visible)).toBeNull();
  });

  it("steps rows", () => {
    const rows = visibleRows(loadedRoot()).filter(isNodeRow);
    expect(stepRow(rows, null, 1)).toBe("a");
    expect(stepRow(rows, "a", 1)).toBe("b");
    expect(stepRow(rows, "b", 1)).toBe("b");
    expect(stepRow(rows, "a", -1)).toBe("a");
  });

  it("arrow right expands then enters, arrow left collapses then exits", () => {
    let s = loadedRoot();
    expect(arrowRight(s, "a")).toEqual({ expand: "a" });
    s = setExpanded(s, "a", true);
    s = finishLoad(startLoad(s, "a", 2), "a", 2, [ref("a1", "a")]);
    expect(arrowRight(s, "a")).toEqual({ select: "a1" });
    expect(arrowRight(s, "b")).toEqual({});
    expect(arrowLeft(s, "a")).toEqual({ collapse: "a" });
    expect(arrowLeft(s, "a1")).toEqual({ select: "a" });
    expect(arrowLeft(setExpanded(s, "a", false), "a")).toEqual({});
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { Registry } from "./ids";
import { Tree } from "./tree";

let reg: Registry;
let tree: Tree;

beforeEach(() => {
  document.body.innerHTML = `
    <nav data-name="Top nav"><a>One</a><a>Two</a><a>Three</a></nav>
    <main><section data-name="Level 1"><div data-name="Level 2"><span class="leaf" data-name="Setting 2.1"></span></div></section></main>
    <script>1</script>`;
  reg = new Registry(document.body);
  tree = new Tree(reg, document.body);
});

const $ = (sel: string) => document.querySelector(sel)!;

describe("Tree", () => {
  it("lists top-level children without non-rendered tags", () => {
    expect(tree.children(null)!.map((r) => r.name)).toEqual(["Top nav", "main"]);
  });

  it("describes a node", () => {
    const [nav] = tree.children(null)!;
    expect(nav).toMatchObject({ name: "Top nav", tag: "nav", hasChildren: true, parentId: null, key: null });
    const kids = tree.children(nav.id)!;
    expect(kids).toHaveLength(3);
    expect(kids[0].parentId).toBe(nav.id);
  });

  it("returns null children for a gone id", () => {
    const id = reg.idOf($("main"));
    $("main").remove();
    expect(tree.children(id)).toBeNull();
  });

  it("reveals every ancestor level in one chain, root first", () => {
    const leafId = reg.idOf($(".leaf"));
    const chain = tree.reveal(leafId)!;
    expect(chain.map((l) => l.id)).toEqual([null, reg.idOf($("main")), reg.idOf($("section")), reg.idOf($("div"))]);
    expect(chain[3].children.map((c) => c.id)).toEqual([leafId]);
  });

  it("searches the whole tree and includes ancestors before matches", () => {
    const { nodes, matchIds } = tree.search("setting");
    expect(matchIds).toEqual([reg.idOf($(".leaf"))]);
    expect(nodes.map((n) => n.name)).toEqual(["main", "Level 1", "Level 2", "Setting 2.1"]);
    expect(tree.search("LEVEL").matchIds).toHaveLength(2);
    expect(tree.search("  ").matchIds).toEqual([]);
  });

  it("navigates relatives with sibling wrap-around", () => {
    const links = Array.from(document.querySelectorAll("nav a"));
    const first = reg.idOf(links[0]);
    const last = reg.idOf(links[2]);
    expect(tree.relative(first, "prev")).toBe(links[2]);
    expect(tree.relative(last, "next")).toBe(links[0]);
    expect(tree.relative(first, "parent")).toBe($("nav"));
    expect(tree.relative(reg.idOf($("nav")), "parent")).toBeNull();
    expect(tree.relative(reg.idOf($("nav")), "child")).toBe(links[0]);
    expect(tree.relative(first, "child")).toBeNull();
  });

  it("wraps a single child onto itself", () => {
    const leaf = $(".leaf");
    expect(tree.relative(reg.idOf(leaf), "next")).toBe(leaf);
  });
});

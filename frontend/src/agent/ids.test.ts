// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { normText, Registry } from "./ids";

// Mirrors page-4: the whole list is rebuilt with innerHTML on every tick,
// new items are prepended, only odd ids carry data-key.
type Item = { id: number; who: string; secs: number };
const people = ["Ada", "Grace", "Linus", "Margaret"];

function feedHtml(items: Item[]): string {
  return items
    .map(
      (it) =>
        `<li${it.id % 2 === 1 ? ` data-key="activity-${it.id}"` : ""}>` +
        `<span class="avatar">${it.who.slice(0, 2)}</span>` +
        `<span class="text"><b>${it.who}</b> did thing ${it.who}</span>` +
        `<span class="time">${it.secs}s ago</span></li>`,
    )
    .join("");
}

let ul: HTMLUListElement;
let reg: Registry;

beforeEach(() => {
  document.body.innerHTML = `<div class="wrap"><ul id="feed"></ul></div>`;
  ul = document.getElementById("feed") as HTMLUListElement;
  reg = new Registry(document.body);
});

const items = (ids: number[], secs = 1): Item[] => ids.map((id) => ({ id, who: people[id % people.length], secs }));

describe("normText", () => {
  it("folds digit runs so ticking timers stay equal", () => {
    const a = document.createElement("span");
    const b = document.createElement("span");
    a.textContent = " 9s   ago ";
    b.textContent = "10s ago";
    expect(normText(a)).toBe(normText(b));
  });
});

describe("Registry", () => {
  it("keeps the same id while a node stays connected", () => {
    ul.innerHTML = feedHtml(items([3, 2]));
    const li = ul.children[1];
    const id = reg.idOf(li);
    expect(reg.idOf(li)).toBe(id);
    expect(reg.rebind()).toEqual([]);
    expect(reg.get(id)).toBe(li);
  });

  it("rebinds an unkeyed item after a rebuild that prepends siblings", () => {
    ul.innerHTML = feedHtml(items([3, 2, 1]));
    const target = ul.children[1]; // id 2, unkeyed ("Linus" is unique text)
    const id = reg.idOf(target);
    ul.innerHTML = feedHtml(items([5, 4, 3, 2, 1], 12));
    expect(reg.rebind()).toEqual([]);
    const now = reg.get(id)!;
    expect(now).not.toBe(target);
    expect(now).toBe(ul.children[3]);
  });

  it("rebinds a keyed item by data-key", () => {
    ul.innerHTML = feedHtml(items([3, 2, 1]));
    const id = reg.idOf(ul.children[0]); // activity-3
    ul.innerHTML = feedHtml(items([4, 3, 2, 1]));
    reg.rebind();
    expect(reg.get(id)?.getAttribute("data-key")).toBe("activity-3");
  });

  it("rebinds descendants of a rebuilt item", () => {
    ul.innerHTML = feedHtml(items([3, 2]));
    const time = ul.children[1].querySelector(".time")!;
    const id = reg.idOf(time);
    ul.innerHTML = feedHtml(items([4, 3, 2]));
    reg.rebind();
    expect(reg.get(id)).toBe(ul.children[2].querySelector(".time"));
  });

  it("drops an item that disappeared", () => {
    ul.innerHTML = feedHtml(items([3, 2, 1]));
    const id = reg.idOf(ul.children[2]); // id 1
    ul.innerHTML = feedHtml(items([4, 3, 2]));
    expect(reg.rebind()).toEqual([id]);
    expect(reg.get(id)).toBeNull();
  });

  it("drops instead of guessing when identical siblings change count", () => {
    ul.innerHTML = `<li>Row</li><li>Row</li>`;
    const id = reg.idOf(ul.children[1]);
    ul.innerHTML = `<li>Row</li><li>Row</li><li>Row</li>`;
    expect(reg.rebind()).toEqual([id]);
  });

  it("falls back to position for identical siblings when the count is unchanged (documented limit)", () => {
    ul.innerHTML = `<li>Row</li><li>Row</li>`;
    const id = reg.idOf(ul.children[1]);
    ul.innerHTML = `<li>Row</li><li>Row</li>`;
    expect(reg.rebind()).toEqual([]);
    expect(reg.get(id)).toBe(ul.children[1]);
  });

  it("never rebinds onto an element owned by another live id", () => {
    ul.innerHTML = `<li data-key="a">A</li>`;
    const oldLi = ul.children[0];
    const oldId = reg.idOf(oldLi);
    const fresh = document.createElement("li");
    fresh.setAttribute("data-key", "a");
    ul.appendChild(fresh);
    const freshId = reg.idOf(fresh);
    oldLi.remove();
    expect(reg.rebind()).toEqual([oldId]);
    expect(reg.get(freshId)).toBe(fresh);
  });

  it("uses refreshed descriptors after sibling changes", () => {
    ul.innerHTML = `<li class="a">A</li>`;
    const li = ul.children[0];
    const id = reg.idOf(li); // unique sig step
    ul.insertAdjacentHTML("afterbegin", `<li class="b">B</li>`);
    reg.rebind(); // still connected; refresh descriptors
    ul.innerHTML = `<li class="b">B</li><li class="a">A</li>`;
    reg.rebind();
    expect(reg.get(id)?.className).toBe("a");
  });
});

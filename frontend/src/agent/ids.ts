// Persistent element ids that survive the page rebuilding its DOM (D5).
//
// Every element the host has seen gets an id and a *descriptor*: the chain of
// steps from <body> down to it, each step using the strongest discriminator
// available among its siblings. When a known element is detached, its
// descriptor is walked through the live DOM; exactly one match at every step
// rebinds the same id to the new node, anything else drops the id. We prefer a
// false "no longer exists" over ever pointing at a different element.

export type Step =
  | { k: "key"; v: string }
  | { k: "id"; v: string }
  | { k: "name"; v: string }
  | { k: "sig"; sig: string }
  | { k: "text"; sig: string; text: string }
  | { k: "nth"; sig: string; nth: number; count: number };

/** Tag plus sorted class list. */
export function sigOf(el: Element): string {
  const cls = (el.getAttribute("class") ?? "").trim().split(/\s+/).filter(Boolean).sort().join(".");
  return el.tagName.toLowerCase() + (cls ? `.${cls}` : "");
}

/** Text with whitespace collapsed and digit runs folded, so "9s ago" ≡ "10s ago" (D22). */
export function normText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().replace(/\d+/g, "#").slice(0, 80);
}

function countWhere(list: Element[], pred: (e: Element) => boolean): number {
  let n = 0;
  for (const e of list) if (pred(e)) n++;
  return n;
}

export function stepFor(el: Element): Step {
  const sibs = Array.from(el.parentElement!.children);
  const key = el.getAttribute("data-key");
  if (key !== null && countWhere(sibs, (s) => s.getAttribute("data-key") === key) === 1) return { k: "key", v: key };
  const id = el.getAttribute("id");
  if (id && countWhere(sibs, (s) => s.getAttribute("id") === id) === 1) return { k: "id", v: id };
  const name = el.getAttribute("data-name");
  if (name && countWhere(sibs, (s) => s.getAttribute("data-name") === name) === 1) return { k: "name", v: name };
  const sig = sigOf(el);
  const same = sibs.filter((s) => sigOf(s) === sig);
  if (same.length === 1) return { k: "sig", sig };
  const text = normText(el);
  if (countWhere(same, (s) => normText(s) === text) === 1) return { k: "text", sig, text };
  return { k: "nth", sig, nth: same.indexOf(el), count: same.length };
}

export function matchStep(parent: Element, step: Step): Element | null {
  const sibs = Array.from(parent.children);
  let found: Element[];
  switch (step.k) {
    case "key":
      found = sibs.filter((s) => s.getAttribute("data-key") === step.v);
      break;
    case "id":
      found = sibs.filter((s) => s.getAttribute("id") === step.v);
      break;
    case "name":
      found = sibs.filter((s) => s.getAttribute("data-name") === step.v);
      break;
    case "sig":
      found = sibs.filter((s) => sigOf(s) === step.sig);
      break;
    case "text":
      found = sibs.filter((s) => sigOf(s) === step.sig && normText(s) === step.text);
      break;
    case "nth": {
      // Positional fallback is only trusted when the sibling set kept its size.
      const same = sibs.filter((s) => sigOf(s) === step.sig);
      return same.length === step.count ? (same[step.nth] ?? null) : null;
    }
  }
  return found.length === 1 ? found[0] : null;
}

export function describe(el: Element, root: Element, memo?: Map<Element, Step>): Step[] | null {
  const steps: Step[] = [];
  let cur = el;
  while (cur !== root) {
    const parent = cur.parentElement;
    if (!parent) return null;
    let step = memo?.get(cur);
    if (!step) {
      step = stepFor(cur);
      memo?.set(cur, step);
    }
    steps.push(step);
    cur = parent;
  }
  return steps.reverse();
}

export function resolve(steps: Step[], root: Element): Element | null {
  let cur: Element | null = root;
  for (const s of steps) {
    cur = matchStep(cur, s);
    if (!cur) return null;
  }
  return cur;
}

export class Registry {
  private byEl = new WeakMap<Element, string>();
  private byId = new Map<string, Element>();
  private desc = new Map<string, Step[]>();
  private seq = 0;

  constructor(
    private readonly root: Element,
    private readonly prefix = "n",
  ) {}

  /** Id for an element, assigning one (and recording its descriptor) if new. */
  idOf(el: Element): string {
    let id = this.peek(el);
    if (id === undefined) {
      id = `${this.prefix}${++this.seq}`;
      this.byEl.set(el, id);
      this.byId.set(id, el);
    }
    const d = describe(el, this.root);
    if (d) this.desc.set(id, d);
    return id;
  }

  /** Id for an element only if it is already known. */
  peek(el: Element): string | undefined {
    const id = this.byEl.get(el);
    return id !== undefined && this.byId.get(id) === el ? id : undefined;
  }

  get(id: string): Element | null {
    const el = this.byId.get(id);
    return el && el.isConnected ? el : null;
  }

  get size(): number {
    return this.byId.size;
  }

  /** Re-resolve detached known elements. Returns ids that could not be rebound. */
  rebind(): string[] {
    const removed: string[] = [];
    for (const [id, el] of [...this.byId]) {
      if (el.isConnected) continue;
      const steps = this.desc.get(id);
      const found = steps ? resolve(steps, this.root) : null;
      const owner = found ? this.peek(found) : undefined;
      // A match already owned by another live id would be a jump → treat as gone.
      if (found && (owner === undefined || owner === id)) {
        this.byEl.set(found, id);
        this.byId.set(id, found);
      } else {
        this.byId.delete(id);
        this.desc.delete(id);
        removed.push(id);
      }
    }
    this.refreshDescriptors();
    return removed;
  }

  /** Recompute descriptors for live elements; call after every mutation batch. */
  refreshDescriptors(): void {
    const memo = new Map<Element, Step>();
    for (const [id, el] of this.byId) {
      if (!el.isConnected) continue;
      const d = describe(el, this.root, memo);
      if (d) this.desc.set(id, d);
    }
  }
}

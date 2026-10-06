import type { NodeRef, RelativeDir, RevealLink } from "../protocol/messages";
import type { Registry } from "./ids";
import { nameOf } from "./naming";

/** Non-rendered tags never appear in the layers tree (D13.4). */
export const HIDDEN_TAGS = new Set(["script", "style", "link", "meta", "template", "noscript", "title", "head", "base"]);

export function visibleChildren(el: Element): Element[] {
  return Array.from(el.children).filter((c) => !HIDDEN_TAGS.has(c.tagName.toLowerCase()));
}

export class Tree {
  constructor(
    private readonly reg: Registry,
    private readonly root: Element,
  ) {}

  ref(el: Element): NodeRef {
    const parent = el.parentElement;
    return {
      id: this.reg.idOf(el),
      name: nameOf(el),
      tag: el.tagName.toLowerCase(),
      hasChildren: visibleChildren(el).length > 0,
      parentId: !parent || parent === this.root ? null : this.reg.idOf(parent),
      key: el.getAttribute("data-key"),
    };
  }

  /** Children of an id (null = body); null if that element is gone. */
  children(id: string | null): NodeRef[] | null {
    const el = id === null ? this.root : this.reg.get(id);
    return el ? visibleChildren(el).map((c) => this.ref(c)) : null;
  }

  /** Ancestors below the root, nearest first. */
  ancestors(el: Element): Element[] {
    const out: Element[] = [];
    for (let a = el.parentElement; a && a !== this.root; a = a.parentElement) out.push(a);
    return out;
  }

  /** Children lists for body and every ancestor of `id`, root first — one round-trip for any depth. */
  reveal(id: string): RevealLink[] | null {
    const el = this.reg.get(id);
    if (!el) return null;
    const links: RevealLink[] = [{ id: null, children: this.children(null)! }];
    for (const a of this.ancestors(el).reverse()) {
      links.push({ id: this.reg.idOf(a), children: visibleChildren(a).map((c) => this.ref(c)) });
    }
    return links;
  }

  /** Case-insensitive name search over the whole page; returns matches plus their ancestors in DOM order. */
  search(q: string): { nodes: NodeRef[]; matchIds: string[] } {
    const needle = q.trim().toLowerCase();
    if (!needle) return { nodes: [], matchIds: [] };
    const nodes = new Map<string, NodeRef>();
    const matchIds: string[] = [];
    const walk = (parent: Element) => {
      for (const c of visibleChildren(parent)) {
        if (nameOf(c).toLowerCase().includes(needle)) {
          // Ancestors first so every parent precedes its children in the result.
          const chain = this.ancestors(c).reverse();
          for (const a of chain) {
            const id = this.reg.idOf(a);
            if (!nodes.has(id)) nodes.set(id, this.ref(a));
          }
          const r = this.ref(c);
          nodes.set(r.id, r);
          matchIds.push(r.id);
        }
        walk(c);
      }
    };
    walk(this.root);
    return { nodes: [...nodes.values()], matchIds };
  }

  relative(id: string, dir: RelativeDir): Element | null {
    const el = this.reg.get(id);
    if (!el) return null;
    const parent = el.parentElement;
    switch (dir) {
      case "child":
        return visibleChildren(el)[0] ?? null;
      case "parent":
        return parent && parent !== this.root ? parent : null;
      case "next":
      case "prev": {
        if (!parent) return null;
        const sibs = visibleChildren(parent);
        const i = sibs.indexOf(el);
        if (i < 0) return null;
        const n = sibs.length;
        return sibs[(i + (dir === "next" ? 1 : n - 1)) % n];
      }
    }
  }
}

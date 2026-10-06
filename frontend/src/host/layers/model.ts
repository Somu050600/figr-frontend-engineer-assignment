import type { NodeRef, RevealLink } from "../../protocol/messages";

// Pure state for one preview's layers tree. Every function returns a new
// state (or the same object when nothing changed) so React can diff cheaply.

export const ROOT = "root";
/** Node id, or ROOT for the children of <body>. */
export type ParentKey = string;
export const keyOf = (id: string | null): ParentKey => id ?? ROOT;
export const idOfKey = (k: ParentKey): string | null => (k === ROOT ? null : k);

export interface ChildList {
  state: "loading" | "loaded" | "error";
  ids: string[];
  /** Identifies the request that owns a "loading" entry; stale replies are ignored. */
  token: number;
}

export interface SearchResult {
  nodes: Record<string, NodeRef>;
  childrenOf: Record<ParentKey, string[]>;
  matchIds: string[];
}

export interface SearchState {
  q: string;
  /** Expanded rows when the search started, restored exactly on clear (R4.11). */
  snapshot: string[];
  result: SearchResult | null;
}

export interface ScreenLayers {
  nodes: Record<string, NodeRef>;
  children: Record<ParentKey, ChildList>;
  expanded: Record<string, true>;
  scrollTop: number;
  search: SearchState | null;
  /** One-shot request for the panel to scroll this row into view. */
  scrollToId: string | null;
  /** Element whose reveal failed (D17). */
  revealError: string | null;
}

export const emptyLayers = (): ScreenLayers => ({
  nodes: {},
  children: {},
  expanded: {},
  scrollTop: 0,
  search: null,
  scrollToId: null,
  revealError: null,
});

export function needsLoad(s: ScreenLayers, parent: ParentKey): boolean {
  const c = s.children[parent];
  return !c || c.state === "error";
}

/** Begin loading unless a load is already in flight or done — re-expanding reuses it (R4.3). */
export function startLoad(s: ScreenLayers, parent: ParentKey, token: number): ScreenLayers {
  if (!needsLoad(s, parent)) return s;
  return { ...s, children: { ...s.children, [parent]: { state: "loading", ids: [], token } } };
}

export function isLoadCurrent(s: ScreenLayers, parent: ParentKey, token: number): boolean {
  const c = s.children[parent];
  return !!c && c.state === "loading" && c.token === token;
}

function setChildren(s: ScreenLayers, parent: ParentKey, refs: NodeRef[]): ScreenLayers {
  const nodes = { ...s.nodes };
  for (const r of refs) nodes[r.id] = r;
  // Replace, never append: no duplicate or missing children whatever the timing.
  const list: ChildList = { state: "loaded", ids: refs.map((r) => r.id), token: s.children[parent]?.token ?? 0 };
  return { ...s, nodes, children: { ...s.children, [parent]: list } };
}

export function finishLoad(s: ScreenLayers, parent: ParentKey, token: number, refs: NodeRef[]): ScreenLayers {
  return isLoadCurrent(s, parent, token) ? setChildren(s, parent, refs) : s;
}

export function failLoad(s: ScreenLayers, parent: ParentKey, token: number): ScreenLayers {
  if (!isLoadCurrent(s, parent, token)) return s;
  return { ...s, children: { ...s.children, [parent]: { state: "error", ids: [], token } } };
}

/** Forget a cancelled load so the next expand starts fresh. */
export function dropLoad(s: ScreenLayers, parent: ParentKey, token: number): ScreenLayers {
  if (!isLoadCurrent(s, parent, token)) return s;
  const { [parent]: _, ...children } = s.children;
  return { ...s, children };
}

/** The page changed a loaded parent's children (R4.10). Ignored for parents never loaded. */
export function applyTreeChanged(s: ScreenLayers, parent: ParentKey, refs: NodeRef[]): ScreenLayers {
  return s.children[parent] ? setChildren(s, parent, refs) : s;
}

export function applyRemoved(s: ScreenLayers, ids: string[]): ScreenLayers {
  const gone = new Set(ids);
  if (!ids.some((id) => s.nodes[id] || s.children[id] || s.expanded[id])) return s;
  const nodes: Record<string, NodeRef> = {};
  for (const [id, n] of Object.entries(s.nodes)) if (!gone.has(id)) nodes[id] = n;
  const children: Record<ParentKey, ChildList> = {};
  for (const [k, c] of Object.entries(s.children)) {
    if (gone.has(k)) continue;
    children[k] = c.ids.some((id) => gone.has(id)) ? { ...c, ids: c.ids.filter((id) => !gone.has(id)) } : c;
  }
  const expanded: Record<string, true> = {};
  for (const id of Object.keys(s.expanded)) if (!gone.has(id)) expanded[id] = true;
  return { ...s, nodes, children, expanded };
}

export function setExpanded(s: ScreenLayers, id: string, open: boolean): ScreenLayers {
  if (!!s.expanded[id] === open) return s;
  const expanded = { ...s.expanded };
  if (open) expanded[id] = true;
  else delete expanded[id];
  return { ...s, expanded };
}

/** Load every ancestor level and expand them, so a deep selection is visible (R4.5). */
export function mergeReveal(s: ScreenLayers, chain: RevealLink[]): ScreenLayers {
  let next = s;
  for (const link of chain) {
    next = setChildren(next, keyOf(link.id), link.children);
    if (link.id) next = setExpanded(next, link.id, true);
  }
  return next;
}

export function beginSearch(s: ScreenLayers, q: string): ScreenLayers {
  return { ...s, search: { q, snapshot: s.search?.snapshot ?? Object.keys(s.expanded), result: s.search?.result ?? null } };
}

export function setSearchResult(s: ScreenLayers, q: string, nodes: NodeRef[], matchIds: string[]): ScreenLayers {
  if (!s.search || s.search.q !== q) return s;
  const byId: Record<string, NodeRef> = {};
  const childrenOf: Record<ParentKey, string[]> = {};
  // Agent sends ancestors before descendants and siblings in DOM order.
  for (const n of nodes) {
    byId[n.id] = n;
    (childrenOf[keyOf(n.parentId)] ??= []).push(n.id);
  }
  return { ...s, search: { ...s.search, result: { nodes: byId, childrenOf, matchIds } } };
}

export function endSearch(s: ScreenLayers): ScreenLayers {
  if (!s.search) return s;
  const expanded: Record<string, true> = {};
  for (const id of s.search.snapshot) expanded[id] = true;
  return { ...s, expanded, search: null };
}

export type Row =
  | { kind: "node"; id: string; depth: number; node: NodeRef; expanded: boolean; match: boolean }
  | { kind: "loading" | "error"; parent: ParentKey; depth: number };

export type NodeRow = Extract<Row, { kind: "node" }>;
export const isNodeRow = (r: Row): r is NodeRow => r.kind === "node";

export function visibleRows(s: Pick<ScreenLayers, "nodes" | "children" | "expanded" | "search">): Row[] {
  const rows: Row[] = [];
  const result = s.search?.result;
  if (result) {
    const matches = new Set(result.matchIds);
    const walk = (parent: ParentKey, depth: number) => {
      for (const id of result.childrenOf[parent] ?? []) {
        const node = result.nodes[id];
        const kids = result.childrenOf[id];
        rows.push({ kind: "node", id, depth, node, expanded: !!kids, match: matches.has(id) });
        if (kids) walk(id, depth + 1);
      }
    };
    walk(ROOT, 0);
    return rows;
  }
  const walk = (parent: ParentKey, depth: number) => {
    const c = s.children[parent];
    if (!c) return;
    if (c.state !== "loaded") {
      rows.push({ kind: c.state, parent, depth });
      return;
    }
    for (const id of c.ids) {
      const node = s.nodes[id];
      if (!node) continue;
      const open = node.hasChildren && !!s.expanded[id];
      rows.push({ kind: "node", id, depth, node, expanded: open, match: false });
      if (open) walk(id, depth + 1);
    }
  };
  walk(ROOT, 0);
  return rows;
}

/** Row to highlight for a hover: the row itself, else its nearest visible ancestor (R4.4). */
export function highlightFor(id: string, ancestorIds: string[], visible: Set<string>): string | null {
  if (visible.has(id)) return id;
  for (const a of ancestorIds) if (visible.has(a)) return a;
  return null;
}

/** ↑/↓ target among visible rows (R4.8). */
export function stepRow(rows: NodeRow[], current: string | null, delta: 1 | -1): string | null {
  if (!rows.length) return null;
  const i = current ? rows.findIndex((r) => r.id === current) : -1;
  if (i < 0) return (delta > 0 ? rows[0] : rows[rows.length - 1]).id;
  return rows[Math.min(rows.length - 1, Math.max(0, i + delta))].id;
}

/** → : expand, or move to the first child when already expanded. */
export function arrowRight(s: ScreenLayers, id: string): { expand?: string; select?: string } {
  const node = s.nodes[id];
  if (!node?.hasChildren) return {};
  if (!s.expanded[id]) return { expand: id };
  const first = s.children[id]?.state === "loaded" ? s.children[id].ids[0] : undefined;
  return first ? { select: first } : {};
}

/** ← : collapse, or move to the parent when already collapsed. */
export function arrowLeft(s: ScreenLayers, id: string): { collapse?: string; select?: string } {
  const node = s.nodes[id];
  if (!node) return {};
  if (node.hasChildren && s.expanded[id]) return { collapse: id };
  return node.parentId ? { select: node.parentId } : {};
}

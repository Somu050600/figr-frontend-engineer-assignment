import { TIMEOUTS, type NodeRef } from "../../protocol/messages";
import { getConnection } from "../connection/registry";
import { CancelledError, isCancellation, TimeoutError } from "../errors";
import { captureIn } from "../regions/registry";
import { reportFailure } from "../regions/reportFailure";
import {
  applyTreeChanged,
  beginSearch,
  dropLoad,
  endSearch,
  failLoad,
  finishLoad,
  isLoadCurrent,
  keyOf,
  mergeReveal,
  needsLoad,
  setExpanded,
  setSearchResult,
  startLoad,
  applyRemoved,
} from "./model";
import { getLayers, updateLayers } from "./store";

// Async side of the layers panel. Each async result is checked against the
// current state before it lands, so a reply for a row that was reset, removed or
// superseded changes nothing and reports nothing (R6.6).

let tokenSeq = 0;
const revealTokens = new Map<string, number>();
const searchTokens = new Map<string, number>();
const searchTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SEARCH_DEBOUNCE_MS = 150;

const keyFor = (screenId: string, id: string | null) => (id ? (getLayers(screenId).nodes[id]?.key ?? undefined) : undefined);

/** Load a row's children once (R4.3). Timeouts → "Couldn't load" on that row only. */
export async function ensureChildren(screenId: string, parentId: string | null): Promise<void> {
  const parent = keyOf(parentId);
  if (!needsLoad(getLayers(screenId), parent)) return;
  const token = ++tokenSeq;
  updateLayers(screenId, (s) => startLoad(s, parent, token));
  try {
    const conn = getConnection(screenId);
    if (!conn) throw new CancelledError("no connection");
    const { children } = await conn.request("getChildren", { id: parentId }, TIMEOUTS.childrenMs);
    updateLayers(screenId, (s) => finishLoad(s, parent, token, children));
  } catch (err) {
    if (isCancellation(err)) {
      updateLayers(screenId, (s) => dropLoad(s, parent, token));
      return;
    }
    if (!isLoadCurrent(getLayers(screenId), parent, token)) return; // row gone or superseded
    updateLayers(screenId, (s) => failLoad(s, parent, token));
    const elementKey = keyFor(screenId, parentId);
    reportFailure(err, { region: "layers-row", screenId, ...(elementKey ? { elementKey } : {}) });
  }
}

export function toggleRow(screenId: string, id: string, open: boolean): void {
  updateLayers(screenId, (s) => setExpanded(s, id, open));
  if (open) void ensureChildren(screenId, id);
}

/** Expand every ancestor of a selected element, loading as needed, in one round-trip (R4.5). */
export async function revealNode(screenId: string, id: string): Promise<void> {
  const conn = getConnection(screenId);
  if (!conn) return;
  const token = ++tokenSeq;
  revealTokens.set(screenId, token);
  updateLayers(screenId, (s) => (s.revealError ? { ...s, revealError: null } : s));
  try {
    const { chain } = await conn.request("reveal", { id }, TIMEOUTS.revealMs);
    if (revealTokens.get(screenId) !== token) return;
    updateLayers(screenId, (s) => ({ ...mergeReveal(s, chain), scrollToId: chain.length ? id : s.scrollToId }));
  } catch (err) {
    if (isCancellation(err) || revealTokens.get(screenId) !== token) return;
    updateLayers(screenId, (s) => ({ ...s, revealError: id }));
    const elementKey = keyFor(screenId, id);
    reportFailure(err, { region: "layers-row", screenId, ...(elementKey ? { elementKey } : {}) });
  }
}

export function retryRow(screenId: string, parentId: string | null): void {
  void ensureChildren(screenId, parentId);
}

export function setQuery(screenId: string, q: string): void {
  clearTimeout(searchTimers.get(screenId));
  if (!q.trim()) {
    searchTokens.delete(screenId);
    updateLayers(screenId, (s) => (s.search ? endSearch(s) : s));
    return;
  }
  updateLayers(screenId, (s) => beginSearch(s, q));
  scheduleSearch(screenId);
}

function scheduleSearch(screenId: string): void {
  clearTimeout(searchTimers.get(screenId));
  searchTimers.set(
    screenId,
    setTimeout(() => {
      runSearch(screenId).catch((err) => captureIn("layers", screenId, err));
    }, SEARCH_DEBOUNCE_MS),
  );
}

/** Search runs in the agent over the whole DOM, including rows never loaded (R4.11). */
export async function runSearch(screenId: string): Promise<void> {
  const q = getLayers(screenId).search?.q;
  const conn = getConnection(screenId);
  if (!q || !conn) return;
  const token = ++tokenSeq;
  searchTokens.set(screenId, token);
  try {
    const { nodes, matchIds } = await conn.request("search", { q }, TIMEOUTS.searchMs);
    if (searchTokens.get(screenId) !== token) return;
    updateLayers(screenId, (s) => setSearchResult(s, q, nodes, matchIds));
  } catch (err) {
    if (isCancellation(err) || searchTokens.get(screenId) !== token) return;
    throw err instanceof TimeoutError ? new TimeoutError("Search timed out") : err;
  }
}

// ---- pushes from the page ----

export function onTreeChanged(screenId: string, parentId: string | null, children: NodeRef[]): void {
  updateLayers(screenId, (s) => applyTreeChanged(s, keyOf(parentId), children));
  if (getLayers(screenId).search) scheduleSearch(screenId);
}

export function onLayersRemoved(screenId: string, ids: string[]): void {
  updateLayers(screenId, (s) => applyRemoved(s, ids));
}

export function forgetScreen(screenId: string): void {
  revealTokens.delete(screenId);
  searchTokens.delete(screenId);
  clearTimeout(searchTimers.get(screenId));
}

import { geometry } from "../overlay/geometry";
import { useBoard } from "../state/board";
import { useHover } from "../state/hover";
import { useSelection } from "../state/selection";
import { allConnections, getConnection } from "./registry";

// Keeps each agent's `watch` (geometry) and `inspect` (live values) sets in step
// with host intent. Only sends when a preview's set actually changed.

const lastWatch = new Map<string, string>();
const lastInspect = new Map<string, string>();

function desired(screenId: string): { watch: string[]; inspect: string[] } {
  const { mode } = useBoard.getState();
  const sel = useSelection.getState();
  const hover = useHover.getState().hover;
  const inspect = sel.screenId === screenId ? sel.ids : [];
  if (mode !== "select") return { watch: [], inspect }; // Interact mode draws nothing
  const watch = new Set(inspect);
  if (hover?.screenId === screenId) watch.add(hover.id);
  return { watch: [...watch], inspect };
}

export function syncScreen(screenId: string, force = false): void {
  const conn = getConnection(screenId);
  if (!conn?.alive) return;
  const d = desired(screenId);
  const w = d.watch.join(",");
  if (force || lastWatch.get(screenId) !== w) {
    lastWatch.set(screenId, w);
    geometry.retain(screenId, d.watch);
    conn.send("watch", { ids: d.watch });
  }
  const i = d.inspect.join(",");
  if (force || lastInspect.get(screenId) !== i) {
    lastInspect.set(screenId, i);
    conn.send("inspect", { ids: d.inspect });
  }
}

export function syncAll(): void {
  for (const c of allConnections()) syncScreen(c.screenId);
}

export function forgetSync(screenId: string): void {
  lastWatch.delete(screenId);
  lastInspect.delete(screenId);
}

let installed = false;
export function installSync(): void {
  if (installed) return;
  installed = true;
  useSelection.subscribe(syncAll);
  useHover.subscribe(syncAll);
  useBoard.subscribe((s, prev) => {
    if (s.mode !== prev.mode) {
      for (const c of allConnections()) c.send("setMode", { mode: s.mode });
      useHover.getState().clear();
      if (s.mode === "select" && document.activeElement instanceof HTMLIFrameElement) document.activeElement.blur();
    }
    syncAll();
  });
}

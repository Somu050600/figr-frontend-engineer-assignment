import type { Geometry } from "../../protocol/messages";

// Latest element geometry per preview, as pushed by the agents. Plain module
// state + subscribe: read every frame by the overlay, never by React.

const byScreen = new Map<string, Map<string, Geometry>>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

export const geometry = {
  get(screenId: string, id: string): Geometry | undefined {
    return byScreen.get(screenId)?.get(id);
  },
  merge(screenId: string, geo: Record<string, Geometry | null>): void {
    let m = byScreen.get(screenId);
    if (!m) byScreen.set(screenId, (m = new Map()));
    for (const [id, g] of Object.entries(geo)) {
      if (g) m.set(id, g);
      else m.delete(id); // scrolled fully out of view: no outline, still selected
    }
    notify();
  },
  /** Keep only ids still being watched, so a re-hover never flashes a stale box. */
  retain(screenId: string, ids: string[]): void {
    const m = byScreen.get(screenId);
    if (!m) return;
    const keep = new Set(ids);
    for (const id of [...m.keys()]) if (!keep.has(id)) m.delete(id);
    notify();
  },
  remove(screenId: string, ids: string[]): void {
    const m = byScreen.get(screenId);
    if (!m) return;
    for (const id of ids) m.delete(id);
    notify();
  },
  clearScreen(screenId: string): void {
    if (byScreen.delete(screenId)) notify();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

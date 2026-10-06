import { create } from "zustand";

// Dev-only failure switches (R6.7). Each one makes a *real* failure happen on
// the normal code path (the server's ?fail=1, a missing page, an agent that goes
// silent, a throw inside a guarded handler) — nothing fakes the error UI.

export type OneShot = "draw" | "message" | "click" | "key";

interface FaultsState {
  latencyMs: number;
  failNext: { screens: boolean; details: boolean };
  throwLayersRender: boolean;
  throwInspectorRender: boolean;
  /** Screen id → URL to load instead of the real page (cleared when the preview dies). */
  pageOverride: Record<string, string>;
  oneShots: Record<OneShot, string[]>;
}

export const useFaults = create<FaultsState>()(() => ({
  latencyMs: 0,
  failNext: { screens: false, details: false },
  throwLayersRender: false,
  throwInspectorRender: false,
  pageOverride: {},
  oneShots: { draw: [], message: [], click: [], key: [] },
}));

export function armOneShot(kind: OneShot, screenId: string): void {
  useFaults.setState((s) => ({ oneShots: { ...s.oneShots, [kind]: [...s.oneShots[kind], screenId] } }));
}

/** True once per armed fault; the caller then throws on its real code path. */
export function consumeOneShot(kind: OneShot, screenId: string): boolean {
  const list = useFaults.getState().oneShots[kind];
  if (!list.includes(screenId)) return false;
  useFaults.setState((s) => ({ oneShots: { ...s.oneShots, [kind]: s.oneShots[kind].filter((id) => id !== screenId) } }));
  return true;
}

export function takeFailNext(endpoint: "screens" | "details"): boolean {
  const on = useFaults.getState().failNext[endpoint];
  if (on) useFaults.setState((s) => ({ failNext: { ...s.failNext, [endpoint]: false } }));
  return on;
}

export function clearPageOverride(screenId: string): void {
  useFaults.setState((s) => {
    if (!(screenId in s.pageOverride)) return s;
    const { [screenId]: _, ...rest } = s.pageOverride;
    return { pageOverride: rest };
  });
}

import { create } from "zustand";

/** One hover on the whole board (R2.2). */
export interface Hover {
  screenId: string;
  id: string;
  source: "preview" | "layers";
  /** Nearest first; lets the layers panel highlight the nearest visible ancestor row (R4.4). */
  ancestorIds: string[];
}

interface HoverState {
  hover: Hover | null;
  /** Bumped on every clear so in-flight hit-tests started before it are discarded (R2.3). */
  epoch: number;
  set(h: Hover): void;
  clear(): void;
}

export const useHover = create<HoverState>()((set) => ({
  hover: null,
  epoch: 0,
  set: (h) =>
    set((s) => {
      const c = s.hover;
      if (c && c.screenId === h.screenId && c.id === h.id && c.source === h.source) return s;
      return { hover: h };
    }),
  clear: () => set((s) => ({ hover: null, epoch: s.epoch + 1 })),
}));

export const clearHover = () => {
  if (useHover.getState().hover) useHover.getState().clear();
  else useHover.setState((s) => ({ epoch: s.epoch + 1 }));
};

export function clearHoverForScreen(screenId: string): void {
  if (useHover.getState().hover?.screenId === screenId) useHover.getState().clear();
}

export function clearHoverIds(screenId: string, ids: string[]): void {
  const h = useHover.getState().hover;
  if (h && h.screenId === screenId && ids.includes(h.id)) useHover.getState().clear();
}

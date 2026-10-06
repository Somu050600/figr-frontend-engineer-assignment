import { create } from "zustand";
import { emptyLayers, type ScreenLayers } from "./model";

// Layers state per preview, kept across active-preview switches (R4.9) and
// dropped only when that preview navigates or the board reloads.

interface LayersStore {
  byScreen: Record<string, ScreenLayers>;
  update(screenId: string, fn: (s: ScreenLayers) => ScreenLayers): void;
  reset(screenId: string): void;
}

export const EMPTY_LAYERS: ScreenLayers = Object.freeze(emptyLayers()) as ScreenLayers;

export const useLayers = create<LayersStore>()((set) => ({
  byScreen: {},
  update: (screenId, fn) =>
    set((st) => {
      const cur = st.byScreen[screenId] ?? emptyLayers();
      const next = fn(cur);
      if (next === cur && st.byScreen[screenId]) return st;
      return { byScreen: { ...st.byScreen, [screenId]: next } };
    }),
  reset: (screenId) =>
    set((st) => {
      if (!st.byScreen[screenId]) return st;
      const { [screenId]: _, ...rest } = st.byScreen;
      return { byScreen: rest };
    }),
}));

export const getLayers = (screenId: string): ScreenLayers => useLayers.getState().byScreen[screenId] ?? EMPTY_LAYERS;
export const updateLayers = (screenId: string, fn: (s: ScreenLayers) => ScreenLayers) => useLayers.getState().update(screenId, fn);

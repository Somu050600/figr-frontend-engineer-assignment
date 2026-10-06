import { create } from "zustand";

// Selection is one preview's ordered id list; the last id is the most recent (R3.5).
// Every change goes through these reducers — the PreviewConnection may only
// remove ids (page removed them) or clear on navigation.

export interface SelectionData {
  /** Preview the layers panel and inspector show (R4.1). */
  activeScreenId: string | null;
  screenId: string | null;
  ids: string[];
  /** Selection emptied because the page removed the elements (R3.7). */
  goneNotice: boolean;
}

export type SelectMode = "replace" | "toggle";

export const emptySelection: SelectionData = { activeScreenId: null, screenId: null, ids: [], goneNotice: false };

export function applySelect(s: SelectionData, screenId: string, ids: string[], mode: SelectMode): SelectionData {
  if (mode === "toggle" && s.screenId === screenId) {
    const next = [...s.ids];
    for (const id of ids) {
      const i = next.indexOf(id);
      if (i >= 0) next.splice(i, 1);
      else next.push(id);
    }
    return { activeScreenId: screenId, screenId, ids: next, goneNotice: false };
  }
  // Replace, or Shift+click in another preview (R3.2).
  return { activeScreenId: screenId, screenId, ids: [...ids], goneNotice: false };
}

export function applyClear(s: SelectionData): SelectionData {
  return { ...s, screenId: null, ids: [], goneNotice: false };
}

export function applyRemoved(s: SelectionData, screenId: string, removed: string[]): SelectionData {
  if (s.screenId !== screenId || s.ids.length === 0) return s;
  const gone = new Set(removed);
  const ids = s.ids.filter((id) => !gone.has(id));
  if (ids.length === s.ids.length) return s;
  return { ...s, ids, screenId: ids.length ? screenId : null, goneNotice: ids.length === 0 };
}

export function applyNavigated(s: SelectionData, screenId: string): SelectionData {
  if (s.screenId !== screenId) return s;
  return { ...s, screenId: null, ids: [], goneNotice: false };
}

interface SelectionStore extends SelectionData {
  select(screenId: string, ids: string[], mode?: SelectMode): void;
  clear(): void;
  setActive(screenId: string): void;
  removed(screenId: string, ids: string[]): void;
  navigated(screenId: string): void;
}

export const useSelection = create<SelectionStore>()((set) => ({
  ...emptySelection,
  select: (screenId, ids, mode = "replace") => set((s) => applySelect(s, screenId, ids, mode)),
  clear: () => set((s) => applyClear(s)),
  setActive: (screenId) => set((s) => (s.activeScreenId === screenId ? s : { activeScreenId: screenId })),
  removed: (screenId, ids) => set((s) => applyRemoved(s, screenId, ids)),
  navigated: (screenId) => set((s) => applyNavigated(s, screenId)),
}));

export const lastSelected = (s: SelectionData): string | null => s.ids[s.ids.length - 1] ?? null;

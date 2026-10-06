import { create } from "zustand";

export type PreviewStatus = "connecting" | "ready" | "error";

export interface PreviewInfo {
  status: PreviewStatus;
  pageErrors: string[];
}

interface PreviewsState {
  byScreen: Record<string, PreviewInfo>;
  setStatus(screenId: string, status: PreviewStatus): void;
  addPageError(screenId: string, message: string): void;
  clearPageErrors(screenId: string): void;
}

const blank: PreviewInfo = { status: "connecting", pageErrors: [] };

export const usePreviews = create<PreviewsState>()((set) => {
  const patch = (screenId: string, fn: (p: PreviewInfo) => PreviewInfo) =>
    set((s) => ({ byScreen: { ...s.byScreen, [screenId]: fn(s.byScreen[screenId] ?? blank) } }));
  return {
    byScreen: {},
    setStatus: (screenId, status) => patch(screenId, (p) => ({ ...p, status })),
    addPageError: (screenId, message) => patch(screenId, (p) => ({ ...p, pageErrors: [...p.pageErrors, message].slice(-20) })),
    clearPageErrors: (screenId) => patch(screenId, (p) => ({ ...p, pageErrors: [] })),
  };
});

export const previewStatus = (screenId: string): PreviewStatus => usePreviews.getState().byScreen[screenId]?.status ?? "connecting";

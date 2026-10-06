import { create } from "zustand";
import type { LiveValues } from "../../protocol/messages";

export const liveKey = (screenId: string, id: string) => `${screenId}|${id}`;

interface LiveState {
  byKey: Record<string, LiveValues | null>;
  merge(screenId: string, data: Record<string, LiveValues | null>): void;
  remove(screenId: string, ids: string[]): void;
  clearScreen(screenId: string): void;
}

export const useLive = create<LiveState>()((set) => ({
  byKey: {},
  merge: (screenId, data) =>
    set((s) => {
      const byKey = { ...s.byKey };
      for (const [id, v] of Object.entries(data)) byKey[liveKey(screenId, id)] = v;
      return { byKey };
    }),
  remove: (screenId, ids) =>
    set((s) => {
      const byKey = { ...s.byKey };
      for (const id of ids) delete byKey[liveKey(screenId, id)];
      return { byKey };
    }),
  clearScreen: (screenId) =>
    set((s) => ({ byKey: Object.fromEntries(Object.entries(s.byKey).filter(([k]) => !k.startsWith(`${screenId}|`))) })),
}));

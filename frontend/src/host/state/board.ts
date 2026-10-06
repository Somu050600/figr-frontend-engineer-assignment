import { create } from "zustand";
import type { Mode } from "../../protocol/messages";

export interface Screen {
  id: string;
  name: string;
  url: string;
}

interface BoardState {
  mode: Mode;
  screens: Screen[];
  setMode(mode: Mode): void;
  setScreens(screens: Screen[]): void;
}

export const useBoard = create<BoardState>()((set) => ({
  mode: "select",
  screens: [],
  setMode: (mode) => set((s) => (s.mode === mode ? s : { mode })),
  setScreens: (screens) => set({ screens }),
}));

export const screenIndex = (screenId: string) => useBoard.getState().screens.findIndex((s) => s.id === screenId);

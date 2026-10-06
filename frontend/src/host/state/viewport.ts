import { useSyncExternalStore } from "react";

// Board pan/zoom. Deliberately NOT React state: it changes every frame while
// panning/zooming and only the world transform + overlay need it, both written
// imperatively. Zero React renders per frame.

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Zoom by `factor` keeping the board point under (px, py) fixed (R1.3). */
export function zoomAt(v: Viewport, px: number, py: number, factor: number): Viewport {
  const zoom = clampZoom(v.zoom * factor);
  const k = zoom / v.zoom;
  return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

export const panBy = (v: Viewport, dx: number, dy: number): Viewport => ({ ...v, x: v.x + dx, y: v.y + dy });

let current: Viewport = { x: 40, y: 56, zoom: 0.3 };
const listeners = new Set<(v: Viewport) => void>();

export const viewport = {
  get: () => current,
  set(next: Viewport) {
    current = next;
    for (const l of listeners) l(next);
  },
  subscribe(fn: (v: Viewport) => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

export function useZoom(): number {
  return useSyncExternalStore(viewport.subscribe, () => current.zoom);
}

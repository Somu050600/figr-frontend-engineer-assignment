import { clearHover } from "../state/hover";
import { panBy, viewport, zoomAt } from "../state/viewport";

export function wheelPixels(e: WheelEvent): { dx: number; dy: number } {
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1;
  return { dx: e.deltaX * k, dy: e.deltaY * k };
}

/** Zoom around a point in board-container coordinates. Mouse wheels and trackpad pinch both arrive here. */
export function zoomBoard(px: number, py: number, deltaY: number): void {
  clearHover(); // R2.3
  const d = Math.max(-50, Math.min(50, deltaY));
  viewport.set(zoomAt(viewport.get(), px, py, Math.exp(-d * 0.01)));
}

export function panBoard(dx: number, dy: number): void {
  clearHover();
  viewport.set(panBy(viewport.get(), dx, dy));
}

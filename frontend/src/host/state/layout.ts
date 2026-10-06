// Board world layout (R1.1). Coordinates are board px at zoom 1.
export const PREVIEW_W = 1280;
export const PREVIEW_H = 800;
export const COLS = 4;
export const GAP_X = 120;
export const GAP_Y = 160;

/** Top-left of preview `index`'s iframe in world coordinates. The name sits above it, in the gap. */
export function previewOrigin(index: number): { x: number; y: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: col * (PREVIEW_W + GAP_X), y: row * (PREVIEW_H + GAP_Y) };
}

import type { RegionName } from "./reportFailure";

// Lets non-React code (the overlay renderer, keyboard handler, dev menu) route an
// error into the region that owns it. A region that is gone simply isn't found,
// so late errors change nothing and report nothing (R6.6).

export interface RegionHandle {
  capture(err: unknown): void;
  retry(): void;
  setTimeout(fn: () => void, ms: number): void;
}

const regions = new Map<string, RegionHandle>();

export const regionKey = (name: RegionName, screenId: string | null) => `${name}:${screenId ?? ""}`;

export function registerRegion(key: string, handle: RegionHandle): () => void {
  regions.set(key, handle);
  return () => {
    if (regions.get(key) === handle) regions.delete(key);
  };
}

export function findRegion(name: RegionName, screenId: string | null): RegionHandle | undefined {
  return regions.get(regionKey(name, screenId));
}

export function captureIn(name: RegionName, screenId: string | null, err: unknown): void {
  findRegion(name, screenId)?.capture(err);
}

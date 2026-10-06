import { forgetSync } from "../connection/sync";
import { forgetScreen, onLayersRemoved } from "../layers/controller";
import { useLayers } from "../layers/store";
import { geometry } from "../overlay/geometry";
import { clearHoverForScreen, clearHoverIds } from "./hover";
import { useLive } from "./live";
import { usePreviews } from "./previews";
import { useSelection } from "./selection";

/** A preview loaded a new document (navigation or retry): forget everything about the old one (R3.8, R4.9). */
export function resetScreen(screenId: string): void {
  useSelection.getState().navigated(screenId);
  clearHoverForScreen(screenId);
  forgetScreen(screenId);
  useLayers.getState().reset(screenId);
  geometry.clearScreen(screenId);
  useLive.getState().clearScreen(screenId);
  usePreviews.getState().clearPageErrors(screenId);
  forgetSync(screenId);
}

/** The page removed elements the host knew about (R3.7, R4.10). */
export function onRemoved(screenId: string, ids: string[]): void {
  useSelection.getState().removed(screenId, ids);
  clearHoverIds(screenId, ids);
  onLayersRemoved(screenId, ids);
  geometry.remove(screenId, ids);
  useLive.getState().remove(screenId, ids);
}

import { TIMEOUTS, type KeyInfo, type RelativeDir } from "../../protocol/messages";
import { getConnection } from "../connection/registry";
import { consumeOneShot } from "../dev/faults";
import { isCancellation, TimeoutError } from "../errors";
import { captureIn } from "../regions/registry";
import { useBoard } from "../state/board";
import { lastSelected, useSelection } from "../state/selection";

// Every shortcut, whether pressed in the host or forwarded by an agent whose
// iframe holds focus, goes through here (R3.6). Returns true when handled.
export function handleShortcut(k: KeyInfo): boolean {
  if (k.meta || k.ctrl || k.alt) return false;
  const active = useSelection.getState().activeScreenId;
  if (active && consumeOneShot("key", active)) throw new Error("Dev: simulated error in a key handler");
  const board = useBoard.getState();
  switch (k.key) {
    case "v":
    case "V":
      board.setMode("select");
      return true;
    case "i":
    case "I":
      board.setMode("interact");
      return true;
    case "Escape":
      useSelection.getState().clear();
      return true;
  }
  if (board.mode !== "select") return false;
  const sel = useSelection.getState();
  const id = lastSelected(sel);
  if (!sel.screenId || !id) return false;
  let dir: RelativeDir | null = null;
  if (k.key === "Enter") dir = k.shift ? "parent" : "child";
  if (k.key === "Tab") dir = k.shift ? "prev" : "next";
  if (!dir) return false;
  void selectRelative(sel.screenId, id, dir);
  return true;
}

/** Enter / Shift+Enter / Tab / Shift+Tab act on the most recent selection and replace it (R3.5). */
async function selectRelative(screenId: string, id: string, dir: RelativeDir): Promise<void> {
  const conn = getConnection(screenId);
  if (!conn) return;
  try {
    const { node } = await conn.request("relative", { id, dir }, TIMEOUTS.relativeMs);
    if (node && useSelection.getState().screenId === screenId) useSelection.getState().select(screenId, [node.id], "replace");
  } catch (err) {
    if (err instanceof TimeoutError || isCancellation(err)) return; // user moved on (D15)
    captureIn("preview", screenId, err);
  }
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");

export function onHostKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || isTyping(e.target)) return;
  try {
    if (handleShortcut({ key: e.key, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey })) e.preventDefault();
  } catch (err) {
    const active = useSelection.getState().activeScreenId;
    captureIn(active ? "preview" : "board", active, err);
  }
}

import type { PushMessage } from "../../protocol/messages";
import { zoomBoard } from "../board/wheel";
import { PageError } from "../errors";
import { handleShortcut } from "../keyboard/shortcuts";
import { onTreeChanged } from "../layers/controller";
import { geometry } from "../overlay/geometry";
import { reportFailure } from "../regions/reportFailure";
import { screenIndex } from "../state/board";
import { previewOrigin } from "../state/layout";
import { useLive } from "../state/live";
import { usePreviews } from "../state/previews";
import { onRemoved } from "../state/reset";
import { viewport } from "../state/viewport";

/** Route one agent push into the stores. Runs inside the preview region's guard. */
export function handlePush(screenId: string, msg: PushMessage): void {
  switch (msg.kind) {
    case "rects":
      geometry.merge(screenId, msg.payload.geo);
      break;
    case "treeChanged":
      onTreeChanged(screenId, msg.payload.parentId, msg.payload.children);
      break;
    case "removed":
      onRemoved(screenId, msg.payload.ids);
      break;
    case "inspectData":
      useLive.getState().merge(screenId, msg.payload.data);
      break;
    case "pageError":
      // Badge, not a region error; each page error is reported once (D13.1).
      usePreviews.getState().addPageError(screenId, msg.payload.message);
      reportFailure(new PageError(msg.payload.message), { region: "preview", screenId });
      break;
    case "key":
      handleShortcut(msg.payload);
      break;
    case "zoomWheel": {
      // Iframe-viewport point → board-container point.
      const i = screenIndex(screenId);
      if (i < 0) break;
      const o = previewOrigin(i);
      const v = viewport.get();
      zoomBoard(v.x + (o.x + msg.payload.x) * v.zoom, v.y + (o.y + msg.payload.y) * v.zoom, msg.payload.deltaY);
      break;
    }
    case "hello":
      break;
  }
}

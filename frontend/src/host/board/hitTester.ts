import { TIMEOUTS, type Requests } from "../../protocol/messages";
import { getConnection } from "../connection/registry";
import { isCancellation, TimeoutError } from "../errors";
import { useBoard } from "../state/board";
import { clearHoverForScreen, useHover } from "../state/hover";

type HitResult = Requests["hitTest"]["res"];

/** One hit-test round-trip; undefined when it timed out or was cancelled (silent, D15). */
export async function hitTestOnce(screenId: string, p: { x: number; y: number }): Promise<HitResult | undefined> {
  const conn = getConnection(screenId);
  if (!conn) return undefined;
  try {
    return await conn.request("hitTest", p, TIMEOUTS.hitTestMs);
  } catch (err) {
    if (err instanceof TimeoutError || isCancellation(err)) return undefined;
    throw err;
  }
}

/**
 * Hover hit-testing for one preview: at most one request in flight, the latest
 * pointer position wins. Results that land after a hover clear (pointer left,
 * pan/zoom started) are discarded via the hover epoch (R2.3).
 */
export class HitTester {
  private inflight = false;
  private next: { x: number; y: number } | null = null;

  constructor(
    private readonly screenId: string,
    private readonly onError: (err: unknown) => void,
  ) {}

  hover(p: { x: number; y: number }): void {
    this.next = p;
    if (!this.inflight) void this.pump();
  }

  cancel(): void {
    this.next = null;
  }

  private async pump(): Promise<void> {
    const p = this.next;
    if (!p) return;
    this.next = null;
    this.inflight = true;
    const epoch = useHover.getState().epoch;
    try {
      const res = await hitTestOnce(this.screenId, p);
      if (!res || useHover.getState().epoch !== epoch || useBoard.getState().mode !== "select") return;
      if (res.node) {
        useHover.getState().set({ screenId: this.screenId, id: res.node.id, source: "preview", ancestorIds: res.ancestorIds });
      } else {
        clearHoverForScreen(this.screenId); // page background shows nothing (R2.5)
      }
    } catch (err) {
      this.onError(err);
    } finally {
      this.inflight = false;
      if (this.next) void this.pump();
    }
  }
}

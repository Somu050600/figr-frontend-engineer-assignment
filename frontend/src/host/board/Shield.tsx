import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { getConnection } from "../connection/registry";
import { consumeOneShot } from "../dev/faults";
import { useRegion } from "../regions/Region";
import { clearHoverForScreen } from "../state/hover";
import { useSelection } from "../state/selection";
import { viewport } from "../state/viewport";
import { hitTestOnce, HitTester } from "./hitTester";
import { wheelPixels } from "./wheel";

/**
 * Transparent layer over the iframe in Select mode (D4). Every pointer event
 * lands here, never in the page — so links, buttons, inputs and forms can't
 * react (R1.5), disabled controls are still hit-testable (R2.4), and focus never
 * enters the iframe, so shortcuts keep working (R3.6).
 */
export function Shield({ screenId }: { screenId: string }) {
  const region = useRegion();
  const ref = useRef<HTMLDivElement>(null);
  const tester = useMemo(() => new HitTester(screenId, region.capture), [screenId, region]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    const z = viewport.get().zoom;
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
  };

  const onPointerMove = region.guard((e: ReactPointerEvent) => {
    if (e.buttons) return;
    tester.hover(local(e));
  });

  const onPointerLeave = () => {
    tester.cancel();
    clearHoverForScreen(screenId);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault(); // no text selection, no focus change
    if (document.activeElement instanceof HTMLIFrameElement) document.activeElement.blur();
  };

  const onClick = region.guard(async (e: React.MouseEvent) => {
    if (consumeOneShot("click", screenId)) throw new Error("Dev: simulated error in a click handler");
    const shift = e.shiftKey;
    const res = await hitTestOnce(screenId, local(e));
    if (!res) return;
    const sel = useSelection.getState();
    if (res.node) {
      sel.select(screenId, [res.node.id], shift ? "toggle" : "replace");
    } else {
      // Page background: this preview becomes active, selection clears (R3.3, D13.5).
      sel.setActive(screenId);
      sel.clear();
    }
  });

  // Wheel without Ctrl scrolls the page under the pointer (R1.4); the board's
  // wheel handler routes it here via data-shield.
  return (
    <div
      ref={ref}
      className="shield"
      data-shield={screenId}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onClick={onClick}
    />
  );
}

export function forwardWheel(screenId: string, shield: Element, e: WheelEvent): void {
  const r = shield.getBoundingClientRect();
  const z = viewport.get().zoom;
  const { dx, dy } = wheelPixels(e);
  getConnection(screenId)?.send("wheel", { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z, dx, dy });
}

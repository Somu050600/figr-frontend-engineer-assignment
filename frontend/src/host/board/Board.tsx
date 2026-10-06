import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { fetchScreens } from "../api/screens";
import { Overlay } from "../overlay/Overlay";
import { useRegion } from "../regions/Region";
import { useBoard } from "../state/board";
import { clearHover } from "../state/hover";
import { useSelection } from "../state/selection";
import { viewport } from "../state/viewport";
import { PreviewSlot } from "./Preview";
import { forwardWheel } from "./Shield";
import { panBoard, wheelPixels, zoomBoard } from "./wheel";

const DRAG_THRESHOLD = 3;

export function Board() {
  const region = useRegion();
  const screens = useBoard((s) => s.screens);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // GET /screens. Failure → this region's error + Retry (R6.2). Abort on unmount is not a failure.
  useEffect(() => {
    const ac = new AbortController();
    fetchScreens(ac.signal).then(
      region.guard((list) => {
        useBoard.getState().setScreens(list);
        setLoaded(true);
      }),
      region.capture,
    );
    return () => ac.abort();
  }, [region]);

  // World transform written straight from the viewport store: no React render per frame.
  useLayoutEffect(() => {
    const world = worldRef.current!;
    const apply = (v: { x: number; y: number; zoom: number }) => {
      world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
      world.style.setProperty("--zoom", String(v.zoom));
    };
    apply(viewport.get());
    return viewport.subscribe(apply);
  }, []);

  useEffect(() => {
    const overlay = new Overlay(overlayRef.current!);
    return () => overlay.dispose();
  }, []);

  // Wheel: Ctrl/Cmd zooms anywhere (R1.3); over a preview it scrolls the page (R1.4); elsewhere it pans (R1.2).
  useEffect(() => {
    const el = containerRef.current!;
    const onWheel = region.guard((e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoomBoard(e.clientX - r.left, e.clientY - r.top, wheelPixels(e).dy);
        return;
      }
      const shield = e.target instanceof Element ? e.target.closest("[data-shield]") : null;
      if (shield) {
        forwardWheel(shield.getAttribute("data-shield")!, shield, e);
        return;
      }
      const { dx, dy } = wheelPixels(e);
      panBoard(-dx, -dy);
    });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [region]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = e.target as Element;
    if (t.closest("[data-shield], iframe, [data-chrome]")) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = region.guard((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) clearHover(); // R2.3
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    panBoard(dx, dy);
  });

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) useSelection.getState().clear(); // click on empty board (R3.3)
  };

  return (
    <div
      ref={containerRef}
      className="board"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      <div ref={worldRef} className="world">
        {screens.map((s, i) => (
          <PreviewSlot key={s.id} screen={s} index={i} />
        ))}
      </div>
      <div ref={overlayRef} className="overlay" />
      {!loaded && <div className="board-status">Loading screens…</div>}
    </div>
  );
}

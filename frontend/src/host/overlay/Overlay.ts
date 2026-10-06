import { consumeOneShot } from "../dev/faults";
import { captureIn } from "../regions/registry";
import { useBoard } from "../state/board";
import { useHover } from "../state/hover";
import { PREVIEW_H, PREVIEW_W, previewOrigin } from "../state/layout";
import { useSelection } from "../state/selection";
import { viewport, type Viewport } from "../state/viewport";
import { geometry } from "./geometry";

const LABEL_H = 18;

type Kind = "hover" | "selected";

/**
 * Draws outlines and labels in *screen* space, outside the scaled board, so
 * lines stay 1px/2px and labels keep their size at any zoom (R3.4). One rAF
 * per change, pooled DOM nodes, no React. Each preview gets a clip box at its
 * screen rect (clipped to preview edges); each outline sits in a box sized to the
 * element's visible region, so inner scroll areas clip it too (D14).
 */
export class Overlay {
  private frame = 0;
  private readonly pool = new Map<string, HTMLElement>();
  private readonly unsubs: Array<() => void>;

  constructor(private readonly root: HTMLElement) {
    const schedule = () => this.schedule();
    this.unsubs = [
      viewport.subscribe(schedule),
      geometry.subscribe(schedule),
      useHover.subscribe(schedule),
      useSelection.subscribe(schedule),
      useBoard.subscribe(schedule),
    ];
    this.schedule();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    for (const u of this.unsubs) u();
    this.root.replaceChildren();
    this.pool.clear();
  }

  private schedule(): void {
    if (!this.frame) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.draw();
      });
    }
  }

  private draw(): void {
    const used = new Set<string>();
    const { mode, screens } = useBoard.getState();
    if (mode === "select") {
      const v = viewport.get();
      const sel = useSelection.getState();
      const hover = useHover.getState().hover;
      const items = new Map<string, Array<{ id: string; kind: Kind }>>();
      const add = (screenId: string, id: string, kind: Kind) => {
        if (!items.has(screenId)) items.set(screenId, []);
        items.get(screenId)!.push({ id, kind });
      };
      if (sel.screenId) for (const id of sel.ids) add(sel.screenId, id, "selected");
      if (hover && !(hover.screenId === sel.screenId && sel.ids.includes(hover.id))) add(hover.screenId, hover.id, "hover");

      for (const [screenId, list] of items) {
        const index = screens.findIndex((s) => s.id === screenId);
        if (index < 0) continue;
        try {
          if (consumeOneShot("draw", screenId)) throw new Error("Dev: simulated error while drawing");
          this.drawPreview(screenId, index, list, v, used);
        } catch (err) {
          captureIn("preview", screenId, err); // drawing errors belong to that preview (R6.5)
        }
      }
    }
    for (const [key, el] of this.pool) {
      if (!used.has(key)) {
        el.remove();
        this.pool.delete(key);
      }
    }
  }

  private node(key: string, className: string, parent: HTMLElement, used: Set<string>): HTMLElement {
    let el = this.pool.get(key);
    if (!el) {
      el = document.createElement("div");
      el.className = className;
      this.pool.set(key, el);
    }
    if (el.parentElement !== parent) parent.appendChild(el);
    used.add(key);
    return el;
  }

  private drawPreview(screenId: string, index: number, list: Array<{ id: string; kind: Kind }>, v: Viewport, used: Set<string>): void {
    const z = v.zoom;
    const o = previewOrigin(index);
    const clip = this.node(`clip:${screenId}`, "ov-clip", this.root, used);
    place(clip, v.x + o.x * z, v.y + o.y * z, PREVIEW_W * z, PREVIEW_H * z);

    for (const { id, kind } of list) {
      const g = geometry.get(screenId, id);
      if (!g) continue; // not measured yet, or scrolled fully out of view
      const k = `${kind}:${screenId}:${id}`;
      const box = this.node(`${k}:box`, "ov-box", clip, used);
      place(box, g.clip.x * z, g.clip.y * z, g.clip.width * z, g.clip.height * z);
      const line = this.node(`${k}:line`, `ov-line ov-${kind}`, box, used);
      place(line, (g.rect.x - g.clip.x) * z, (g.rect.y - g.clip.y) * z, g.rect.width * z, g.rect.height * z);

      const label = this.node(`${k}:label`, `ov-label ov-${kind}`, clip, used);
      if (label.textContent !== g.name) label.textContent = g.name;
      const top = g.rect.y * z;
      // Below the element when there's no room above it inside the preview (R3.4).
      const y = top - LABEL_H >= 0 ? top - LABEL_H : (g.rect.y + g.rect.height) * z + 2;
      const x = Math.max(0, g.rect.x * z);
      label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }
}

function place(el: HTMLElement, x: number, y: number, w: number, h: number): void {
  const s = el.style;
  s.left = `${x}px`;
  s.top = `${y}px`;
  s.width = `${w}px`;
  s.height = `${h}px`;
}

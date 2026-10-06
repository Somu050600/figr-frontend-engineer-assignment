// In-page agent. Loaded by the one <script> tag each preview page is allowed.
// Owns everything that requires DOM access: element ids, the tree, geometry,
// scrolling and page errors. Talks to the host only through postMessage.

import {
  envelope,
  INTERACT_KEYS,
  isEnvelope,
  REPLY,
  SELECT_KEYS,
  type Fires,
  type Geometry,
  type LiveValues,
  type Mode,
  type NodeRef,
  type Pushes,
  type Requests,
} from "../protocol/messages";
import { geometryKey, geometryOf } from "./geometry";
import { Registry } from "./ids";
import { liveValues } from "./inspect";
import { scrollToElement, wheelAt } from "./scroll";
import { Tree } from "./tree";

declare global {
  interface Window {
    __figrAgent?: true;
  }
}

const SLOW_CHILDREN_MS = 5_000;
const FALLBACK_TICK_MS = 150;

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

function wheelPixels(e: WheelEvent): { dx: number; dy: number } {
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1;
  return { dx: e.deltaX * k, dy: e.deltaY * k };
}

function boot(): void {
  if (window.__figrAgent || window.parent === window) return;
  window.__figrAgent = true;

  // A fresh id per document: a new docId in `hello` is how the host learns the preview navigated (D6).
  const docId = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  let hostOrigin: string | null = null;
  let mode: Mode = "select";
  let silent = false;
  let slowChildren = false;
  const queuedErrors: string[] = [];

  function post<K extends keyof Pushes>(kind: K, payload: Pushes[K]): void;
  function post(kind: typeof REPLY, payload: unknown, reqId: number, error?: string): void;
  function post(kind: string, payload: unknown, reqId?: number, error?: string): void {
    if (silent) return;
    // Only `hello` may go out before the host is known; it carries nothing but the docId.
    if (hostOrigin === null && kind !== "hello") return;
    window.parent.postMessage(envelope(docId, kind, payload, reqId, error), hostOrigin ?? "*");
  }

  // Registered before page scripts run (the tag sits in <head>) so load-time errors are caught too.
  const pageError = (message: string) => {
    if (hostOrigin) post("pageError", { message });
    else queuedErrors.push(message);
  };
  window.addEventListener("error", (e) => {
    if (e instanceof ErrorEvent) pageError(e.message || String(e.error));
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    pageError(`Unhandled rejection: ${r instanceof Error ? r.message : String(r)}`);
  });

  const start = () => {
    const body = document.body;
    const reg = new Registry(body);
    const tree = new Tree(reg, body);

    // Parents whose children the host has loaded → last children signature sent.
    const loaded = new Map<string, string>();
    const parentKey = (id: string | null) => id ?? "";
    const markLoaded = (id: string | null, refs: NodeRef[]) => loaded.set(parentKey(id), JSON.stringify(refs));

    let watched: string[] = [];
    let inspected: string[] = [];
    const lastGeo = new Map<string, string>();
    const lastLive = new Map<string, string>();
    let raf = 0;
    let fallback = 0;

    // Geometry + live values are polled per frame while anything is watched:
    // catches every cause (any scroller, transitions, rebuilds) for a handful of elements (D14).
    const tick = () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
      raf = 0;
      fallback = 0;
      try {
        const geo: Record<string, Geometry | null> = {};
        let geoChanged = false;
        for (const id of watched) {
          const el = reg.get(id);
          const g = el ? geometryOf(el, document) : null;
          const k = geometryKey(g);
          if (lastGeo.get(id) !== k) {
            lastGeo.set(id, k);
            geo[id] = g;
            geoChanged = true;
          }
        }
        if (geoChanged) post("rects", { geo });

        const data: Record<string, LiveValues | null> = {};
        let dataChanged = false;
        for (const id of inspected) {
          const el = reg.get(id);
          const v = el ? liveValues(el, document) : null;
          const k = JSON.stringify(v);
          if (lastLive.get(id) !== k) {
            lastLive.set(id, k);
            data[id] = v;
            dataChanged = true;
          }
        }
        if (dataChanged) post("inspectData", { data });
      } finally {
        kick();
      }
    };
    // Browsers stop rAF in off-screen cross-origin iframes, so a timer backs it up:
    // the inspector still gets live values for a preview panned out of view.
    const kick = () => {
      if (raf || !(watched.length || inspected.length)) return;
      raf = requestAnimationFrame(tick);
      fallback = window.setTimeout(tick, FALLBACK_TICK_MS);
    };

    const observer = new MutationObserver(() => {
      const removed = reg.rebind();
      if (removed.length) post("removed", { ids: removed });
      for (const [key, sig] of loaded) {
        const id = key === "" ? null : key;
        const refs = tree.children(id);
        if (refs === null) {
          loaded.delete(key);
          continue;
        }
        const next = JSON.stringify(refs);
        if (next !== sig) {
          loaded.set(key, next);
          post("treeChanged", { parentId: id, children: refs });
        }
      }
    });
    observer.observe(body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "id", "data-name", "data-key"],
    });

    type Handlers = { [K in keyof Requests]: (req: Requests[K]["req"]) => Requests[K]["res"] };
    const requests: Handlers = {
      init: ({ mode: m }) => {
        mode = m;
        return { ok: true };
      },
      ping: () => ({ ok: true }),
      hitTest: ({ x, y }) => {
        const el = document.elementsFromPoint(x, y)[0];
        if (!el || el === body || el === document.documentElement) return { node: null, ancestorIds: [] };
        return { node: tree.ref(el), ancestorIds: tree.ancestors(el).map((a) => reg.idOf(a)) };
      },
      getChildren: ({ id }) => {
        const children = tree.children(id) ?? [];
        markLoaded(id, children);
        return { children };
      },
      reveal: ({ id }) => {
        const chain = tree.reveal(id) ?? [];
        for (const link of chain) markLoaded(link.id, link.children);
        return { chain };
      },
      search: ({ q }) => tree.search(q),
      relative: ({ id, dir }) => {
        const el = tree.relative(id, dir);
        return { node: el ? tree.ref(el) : null };
      },
      scrollTo: ({ id }) => {
        const el = reg.get(id);
        if (el) scrollToElement(el, document);
        return { ok: !!el };
      },
    };

    type FireHandlers = { [K in keyof Fires]: (p: Fires[K]) => void };
    const fires: FireHandlers = {
      wheel: ({ x, y, dx, dy }) => wheelAt(document, x, y, dx, dy),
      watch: ({ ids }) => {
        watched = ids;
        lastGeo.clear(); // host dropped its copies; resend everything fresh
        kick();
      },
      inspect: ({ ids }) => {
        inspected = ids;
        lastLive.clear();
        kick();
      },
      setMode: ({ mode: m }) => {
        mode = m;
        if (m === "select" && document.activeElement instanceof HTMLElement) document.activeElement.blur();
      },
      devFault: ({ fault }) => {
        if (fault === "silent") silent = true;
        if (fault === "slowChildren") slowChildren = true;
        if (fault === "pageThrow")
          setTimeout(() => {
            throw new Error("Dev: simulated page error");
          });
      },
    };

    window.addEventListener("message", (e) => {
      if (silent || e.source !== window.parent || !isEnvelope(e.data)) return;
      const msg = e.data;
      if (hostOrigin === null) {
        // Lock onto whoever answers our hello with a matching init; ignore everyone else after.
        if (msg.kind !== "init" || msg.docId !== docId) return;
        hostOrigin = e.origin;
      } else if (e.origin !== hostOrigin || msg.docId !== docId) {
        return;
      }

      if (msg.kind in requests && msg.reqId !== undefined) {
        const reqId = msg.reqId;
        let res: unknown;
        try {
          res = (requests[msg.kind as keyof Requests] as (p: unknown) => unknown)(msg.payload);
        } catch (err) {
          post(REPLY, null, reqId, err instanceof Error ? err.message : String(err));
          return;
        }
        if (msg.kind === "getChildren" && slowChildren) setTimeout(() => post(REPLY, res, reqId), SLOW_CHILDREN_MS);
        else post(REPLY, res, reqId);
        if (msg.kind === "init") for (const m of queuedErrors.splice(0)) post("pageError", { message: m });
      } else if (msg.kind in fires) {
        (fires[msg.kind as keyof Fires] as (p: unknown) => void)(msg.payload);
      }
    });

    window.addEventListener(
      "keydown",
      (e) => {
        if (!hostOrigin || e.metaKey || e.ctrlKey || e.altKey) return;
        if (mode === "select") {
          // Focus can be left in the page after Interact mode; keep every shortcut working (D19).
          if (!SELECT_KEYS.has(e.key)) return;
          e.preventDefault();
          e.stopImmediatePropagation();
        } else if (!INTERACT_KEYS.has(e.key) || isEditable(e.target)) {
          return;
        }
        post("key", { key: e.key, shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey });
      },
      true,
    );

    // Ctrl/Cmd+wheel (and trackpad pinch) inside the page zooms the board, not the page (R1.3).
    window.addEventListener(
      "wheel",
      (e) => {
        if (!hostOrigin || !(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        post("zoomWheel", { x: e.clientX, y: e.clientY, deltaY: wheelPixels(e).dy });
      },
      { capture: true, passive: false },
    );

    post("hello", {});
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

boot();

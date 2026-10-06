// Host ↔ page protocol. Imported by both the host app and the in-page agent.

export const NS = "figr" as const;
export const VERSION = 1 as const;
export const REPLY = "reply" as const;

export const TIMEOUTS = {
  connectMs: 10_000,
  heartbeatCheckMs: 1_000,
  heartbeatPingMs: 5_000,
  heartbeatDeadMs: 10_000,
  childrenMs: 3_000,
  revealMs: 3_000,
  searchMs: 3_000,
  hitTestMs: 1_000,
  relativeMs: 1_000,
  scrollToMs: 1_000,
} as const;

export type Mode = "select" | "interact";
export type RelativeDir = "child" | "parent" | "next" | "prev";
export type DevFault = "silent" | "slowChildren" | "pageThrow";

export interface NodeRef {
  id: string;
  name: string;
  tag: string;
  hasChildren: boolean;
  /** null when the parent is <body> (top level). */
  parentId: string | null;
  key: string | null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Iframe-viewport coordinates. `clip` = viewport ∩ every overflow-clipping ancestor. */
export interface Geometry {
  rect: Rect;
  clip: Rect;
  name: string;
}

export interface LiveValues {
  name: string;
  tag: string;
  id: string;
  classes: string[];
  key: string | null;
  width: number;
  height: number;
  x: number;
  y: number;
  text: string;
  color: string;
  background: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
}

export interface RevealLink {
  /** null = <body> */
  id: string | null;
  children: NodeRef[];
}

export interface KeyInfo {
  key: string;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
}

/** Host → agent, answered with a REPLY carrying the same reqId. */
export interface Requests {
  init: { req: { mode: Mode }; res: { ok: true } };
  ping: { req: Record<string, never>; res: { ok: true } };
  hitTest: { req: { x: number; y: number }; res: { node: NodeRef | null; ancestorIds: string[] } };
  getChildren: { req: { id: string | null }; res: { children: NodeRef[] } };
  reveal: { req: { id: string }; res: { chain: RevealLink[] } };
  search: { req: { q: string }; res: { nodes: NodeRef[]; matchIds: string[] } };
  relative: { req: { id: string; dir: RelativeDir }; res: { node: NodeRef | null } };
  scrollTo: { req: { id: string }; res: { ok: boolean } };
}

/** Host → agent, fire and forget. */
export interface Fires {
  wheel: { x: number; y: number; dx: number; dy: number };
  watch: { ids: string[] };
  inspect: { ids: string[] };
  setMode: { mode: Mode };
  devFault: { fault: DevFault };
}

/** Agent → host, unsolicited. */
export interface Pushes {
  hello: Record<string, never>;
  rects: { geo: Record<string, Geometry | null> };
  treeChanged: { parentId: string | null; children: NodeRef[] };
  removed: { ids: string[] };
  inspectData: { data: Record<string, LiveValues | null> };
  pageError: { message: string };
  key: KeyInfo;
  zoomWheel: { x: number; y: number; deltaY: number };
}

export type PushMessage = { [K in keyof Pushes]: { kind: K; payload: Pushes[K] } }[keyof Pushes];

export interface Envelope {
  ns: typeof NS;
  v: typeof VERSION;
  docId: string;
  kind: string;
  reqId?: number;
  payload?: unknown;
  error?: string;
}

export function envelope(docId: string, kind: string, payload?: unknown, reqId?: number, error?: string): Envelope {
  const e: Envelope = { ns: NS, v: VERSION, docId, kind, payload };
  if (reqId !== undefined) e.reqId = reqId;
  if (error !== undefined) e.error = error;
  return e;
}

export function isEnvelope(x: unknown): x is Envelope {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return e.ns === NS && e.v === VERSION && typeof e.kind === "string" && typeof e.docId === "string";
}

/** Keys the agent forwards in Select mode (focus stuck in the iframe). */
export const SELECT_KEYS = new Set(["v", "V", "i", "I", "Escape", "Enter", "Tab"]);
/** Keys the agent forwards in Interact mode, only outside editable fields. */
export const INTERACT_KEYS = new Set(["v", "V", "i", "I", "Escape"]);

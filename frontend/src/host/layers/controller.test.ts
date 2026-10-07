import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reported = vi.hoisted(() => [] as unknown[][]);
vi.mock("../../../report.js", () => ({ report: (...args: unknown[]) => reported.push(args) }));

import type { NodeRef } from "../../protocol/messages";
import type { PreviewConnection } from "../connection/PreviewConnection";
import { setConnection } from "../connection/registry";
import { CancelledError, TimeoutError } from "../errors";
import { ensureChildren, retryRow, revealNode } from "./controller";
import { isNodeRow, ROOT, visibleRows } from "./model";
import { getLayers, useLayers } from "./store";

const ref = (id: string, parentId: string | null = null): NodeRef => ({ id, name: id, tag: "div", hasChildren: false, parentId, key: `k-${id}` });

type Pending = { kind: string; resolve(v: unknown): void; reject(e: Error): void };
let pending: Pending[];

function fakeConnection(): PreviewConnection {
  return {
    request: (kind: string) => new Promise((resolve, reject) => pending.push({ kind, resolve, reject })),
  } as unknown as PreviewConnection;
}

const S = "scr-test";
const flush = () => new Promise((r) => setTimeout(r, 0));
const rowIds = () => visibleRows(getLayers(S)).map((r) => (isNodeRow(r) ? r.id : r.kind));

beforeEach(() => {
  pending = [];
  reported.length = 0;
  useLayers.getState().reset(S);
  setConnection(S, fakeConnection());
});
afterEach(() => setConnection(S, null));

describe("layers controller", () => {
  it("loads children once even when asked twice", async () => {
    void ensureChildren(S, null);
    void ensureChildren(S, null);
    expect(pending).toHaveLength(1);
    pending[0].resolve({ children: [ref("a"), ref("b")] });
    await flush();
    expect(rowIds()).toEqual(["a", "b"]);
  });

  it("reports a row timeout exactly once and ignores the late reply", async () => {
    const p = ensureChildren(S, null);
    pending[0].reject(new TimeoutError("getChildren timed out"));
    await p;
    expect(rowIds()).toEqual(["error"]);
    expect(reported).toHaveLength(1);
    expect(reported[0][1]).toEqual({ region: "layers-row", screenId: S });
    pending[0].resolve({ children: [ref("late")] }); // too late: request already settled
    await flush();
    expect(rowIds()).toEqual(["error"]);
  });

  it("a retry that fails again is a new failure", async () => {
    const first = ensureChildren(S, null);
    pending[0].reject(new TimeoutError("t"));
    await first;
    retryRow(S, null);
    pending[1].reject(new TimeoutError("t"));
    await flush();
    expect(reported).toHaveLength(2);
  });

  it("does not report a cancelled load and lets the next expand start fresh", async () => {
    const p = ensureChildren(S, null);
    pending[0].reject(new CancelledError("navigated"));
    await p;
    expect(reported).toHaveLength(0);
    expect(getLayers(S).children[ROOT]).toBeUndefined();
  });

  it("drops a result whose row was reset meanwhile (R6.6)", async () => {
    const p = ensureChildren(S, null);
    useLayers.getState().reset(S); // preview navigated
    pending[0].reject(new TimeoutError("t"));
    await p;
    expect(reported).toHaveLength(0);
    expect(getLayers(S).children[ROOT]).toBeUndefined();
  });

  it("reveal: only the latest request lands", async () => {
    void revealNode(S, "old");
    void revealNode(S, "new");
    pending[1].resolve({ chain: [{ id: null, children: [ref("new")] }] });
    pending[0].resolve({ chain: [{ id: null, children: [ref("old")] }] });
    await flush();
    expect(rowIds()).toEqual(["new"]);
    expect(getLayers(S).scrollToId).toBe("new");
  });
});

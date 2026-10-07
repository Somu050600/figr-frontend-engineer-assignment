import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewConnection } from "../connection/PreviewConnection";
import { setConnection } from "../connection/registry";
import { useHover } from "../state/hover";
import { HitTester } from "./hitTester";

type Pending = { payload: { x: number; y: number }; resolve(v: unknown): void };
let pending: Pending[];
const S = "scr-hit";
const flush = () => new Promise((r) => setTimeout(r, 0));
const hit = (id: string) => ({ node: { id, name: id, tag: "div", hasChildren: false, parentId: null, key: null }, ancestorIds: [] });

beforeEach(() => {
  pending = [];
  useHover.setState({ hover: null, epoch: 0 });
  setConnection(S, {
    request: (_kind: string, payload: { x: number; y: number }) => new Promise((resolve) => pending.push({ payload, resolve })),
  } as unknown as PreviewConnection);
});

describe("HitTester", () => {
  it("keeps one request in flight and sends the latest point next", async () => {
    const t = new HitTester(S, vi.fn());
    t.hover({ x: 1, y: 1 });
    t.hover({ x: 2, y: 2 });
    t.hover({ x: 3, y: 3 });
    expect(pending).toHaveLength(1);
    pending[0].resolve(hit("a"));
    await flush();
    expect(pending).toHaveLength(2);
    expect(pending[1].payload).toEqual({ x: 3, y: 3 });
  });

  it("drops a reply that lands after the pointer left, even with no hover set (R2.3)", async () => {
    const t = new HitTester(S, vi.fn());
    t.hover({ x: 1, y: 1 });
    t.cancel(); // pointer left before the reply
    pending[0].resolve(hit("a"));
    await flush();
    expect(useHover.getState().hover).toBeNull();
  });

  it("drops a reply after a pan/zoom cleared the hover", async () => {
    const t = new HitTester(S, vi.fn());
    t.hover({ x: 1, y: 1 });
    useHover.getState().clear();
    pending[0].resolve(hit("a"));
    await flush();
    expect(useHover.getState().hover).toBeNull();
  });

  it("sets the hover for a fresh reply", async () => {
    const t = new HitTester(S, vi.fn());
    t.hover({ x: 1, y: 1 });
    pending[0].resolve(hit("a"));
    await flush();
    expect(useHover.getState().hover).toMatchObject({ screenId: S, id: "a", source: "preview" });
  });
});

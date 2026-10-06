import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envelope, REPLY, TIMEOUTS, type Envelope } from "../../protocol/messages";
import { CancelledError, ConnectError, TimeoutError } from "../errors";
import { PreviewConnection, type ConnectionEvents } from "./PreviewConnection";

const ORIGIN = "http://localhost:4001";

function setup() {
  const sent: Envelope[] = [];
  const target = { postMessage: vi.fn((m: Envelope, o: string) => (o === ORIGIN ? sent.push(m) : undefined)) };
  const events: ConnectionEvents = { onReady: vi.fn(), onPush: vi.fn(), onDead: vi.fn() };
  const conn = new PreviewConnection("scr-01", ORIGIN, () => "select", events);
  conn.attach(target);
  const fromPage = (env: Envelope, origin = ORIGIN) => conn.handle(env, origin);
  const reply = (req: Envelope, payload: unknown, docId = req.docId) => fromPage(envelope(docId, REPLY, payload, req.reqId));
  return { conn, events, sent, fromPage, reply, target };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("PreviewConnection", () => {
  it("dies with a ConnectError when no hello arrives within 10s", () => {
    const { events } = setup();
    vi.advanceTimersByTime(TIMEOUTS.connectMs + 1);
    expect(events.onDead).toHaveBeenCalledTimes(1);
    expect(vi.mocked(events.onDead).mock.calls[0][0]).toBeInstanceOf(ConnectError);
  });

  it("becomes ready on hello and sends init to the pages origin", () => {
    const { events, sent, fromPage } = setup();
    fromPage(envelope("doc-a", "hello", {}));
    expect(events.onReady).toHaveBeenCalledWith("doc-a", false);
    expect(sent[0]).toMatchObject({ kind: "init", docId: "doc-a", payload: { mode: "select" } });
    vi.advanceTimersByTime(TIMEOUTS.connectMs + 1);
    expect(events.onDead).not.toHaveBeenCalled();
  });

  it("ignores messages from another origin", () => {
    const { events, fromPage } = setup();
    fromPage(envelope("doc-a", "hello", {}), "http://evil.test");
    expect(events.onReady).not.toHaveBeenCalled();
  });

  it("resolves requests and drops replies for another document", async () => {
    const { conn, sent, fromPage, reply } = setup();
    fromPage(envelope("doc-a", "hello", {}));
    const p = conn.request("getChildren", { id: null }, 3000);
    const req = sent.at(-1)!;
    reply(req, { children: [] }, "doc-old");
    reply(req, { children: [{ id: "n1" }] });
    await expect(p).resolves.toEqual({ children: [{ id: "n1" }] });
  });

  it("times out and ignores a late reply", async () => {
    const { conn, sent, fromPage, reply } = setup();
    fromPage(envelope("doc-a", "hello", {}));
    const p = conn.request("getChildren", { id: null }, 3000);
    const req = sent.at(-1)!;
    vi.advanceTimersByTime(3001);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    expect(() => reply(req, { children: [] })).not.toThrow();
  });

  it("treats a new docId as navigation and cancels pending requests", async () => {
    const { conn, events, fromPage } = setup();
    fromPage(envelope("doc-a", "hello", {}));
    const p = conn.request("search", { q: "x" }, 3000);
    fromPage(envelope("doc-b", "hello", {}));
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(events.onReady).toHaveBeenLastCalledWith("doc-b", true);
  });

  it("forwards pushes for the current document only", () => {
    const { events, fromPage } = setup();
    fromPage(envelope("doc-a", "hello", {}));
    fromPage(envelope("doc-x", "removed", { ids: ["n1"] }));
    fromPage(envelope("doc-a", "removed", { ids: ["n2"] }));
    expect(events.onPush).toHaveBeenCalledTimes(1);
    expect(events.onPush).toHaveBeenCalledWith({ kind: "removed", payload: { ids: ["n2"] } });
  });

  it("dies once when the page stops answering heartbeats", () => {
    const { events, fromPage } = setup();
    fromPage(envelope("doc-a", "hello", {}));
    vi.advanceTimersByTime(TIMEOUTS.heartbeatDeadMs + 2 * TIMEOUTS.heartbeatCheckMs);
    vi.advanceTimersByTime(60_000);
    expect(events.onDead).toHaveBeenCalledTimes(1);
  });

  it("stays alive while the page keeps answering pings", () => {
    const { events, sent, fromPage, reply } = setup();
    fromPage(envelope("doc-a", "hello", {}));
    reply(sent[0], { ok: true }); // init
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(TIMEOUTS.heartbeatCheckMs);
      const ping = sent.findLast((m) => m.kind === "ping");
      if (ping) reply(ping, { ok: true });
    }
    expect(events.onDead).not.toHaveBeenCalled();
  });

  it("arms the connect timer only after a load event with no new hello", () => {
    const { conn, events, sent, fromPage, reply } = setup();
    // Keep the old document's heartbeat answered so only the connect timer can kill it.
    const answerPings = (ms: number) => {
      for (let t = 0; t < ms; t += TIMEOUTS.heartbeatCheckMs) {
        vi.advanceTimersByTime(TIMEOUTS.heartbeatCheckMs);
        const ping = sent.findLast((m) => m.kind === "ping");
        if (ping) reply(ping, { ok: true });
      }
    };
    fromPage(envelope("doc-a", "hello", {}));
    reply(sent[0], { ok: true });
    conn.loaded(); // doc-a's own load: its hello came first → no timer
    answerPings(TIMEOUTS.connectMs + 2_000);
    expect(events.onDead).not.toHaveBeenCalled();
    conn.loaded(); // navigated to a page without the agent
    answerPings(TIMEOUTS.connectMs + 1_000);
    expect(events.onDead).toHaveBeenCalledTimes(1);
    expect(vi.mocked(events.onDead).mock.calls[0][0].message).toBe("Couldn't connect to this preview");
  });

  it("rejects requests as cancelled before connecting and after dispose", async () => {
    const { conn, fromPage } = setup();
    await expect(conn.request("ping", {}, 100)).rejects.toBeInstanceOf(CancelledError);
    fromPage(envelope("doc-a", "hello", {}));
    const p = conn.request("ping", {}, 1000);
    conn.dispose();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
  });
});

import { envelope, isEnvelope, REPLY, TIMEOUTS, type Fires, type Mode, type PushMessage, type Requests } from "../../protocol/messages";
import { CancelledError, ConnectError, RemoteError, TimeoutError } from "../errors";

export interface ConnectionEvents {
  /** A document answered. `navigated` = a different document than before (D6). */
  onReady(docId: string, navigated: boolean): void;
  onPush(msg: PushMessage): void;
  /** Connect timeout or heartbeat loss. Fires at most once per connection. */
  onDead(err: Error): void;
}

interface Pending {
  resolve(v: unknown): void;
  reject(e: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

interface Target {
  postMessage(message: unknown, targetOrigin: string): void;
}

/**
 * One per preview iframe. The only place page messages enter the host: owns
 * the request table, timeouts, the docId gate and liveness. Late or stale
 * messages (wrong origin, old docId, settled reqId) are dropped here.
 */
export class PreviewConnection {
  docId: string | null = null;
  private target: Target | null = null;
  private pending = new Map<number, Pending>();
  private seq = 0;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastSeenAt = 0;
  private lastPingAt = 0;
  private lastHelloAt = -Infinity;
  private lastLoadAt = -Infinity;
  private dead = false;
  private disposed = false;

  constructor(
    readonly screenId: string,
    readonly targetOrigin: string,
    private readonly mode: () => Mode,
    private readonly events: ConnectionEvents,
  ) {}

  attach(target: Target): void {
    this.target = target;
    this.armConnectTimer();
  }

  matches(source: unknown): boolean {
    return source !== null && source === this.target;
  }

  get alive(): boolean {
    return !this.dead && !this.disposed && this.docId !== null;
  }

  /** Call on every iframe `load` event. */
  loaded(): void {
    const previousLoad = this.lastLoadAt;
    this.lastLoadAt = Date.now();
    // The new document's hello arrives before its load event. No hello since
    // the previous load means this document has no (working) agent.
    if (this.lastHelloAt <= previousLoad) this.armConnectTimer();
  }

  handle(data: unknown, origin: string): void {
    if (this.disposed || this.dead || origin !== this.targetOrigin || !isEnvelope(data)) return;
    if (data.kind === "hello") return this.onHello(data.docId);
    if (data.docId !== this.docId) return;
    this.lastSeenAt = Date.now();
    if (data.kind === REPLY) {
      const p = data.reqId === undefined ? undefined : this.pending.get(data.reqId);
      if (!p) return; // already timed out or cancelled
      this.pending.delete(data.reqId!);
      clearTimeout(p.timer);
      if (data.error !== undefined) p.reject(new RemoteError(data.error));
      else p.resolve(data.payload);
      return;
    }
    this.events.onPush({ kind: data.kind, payload: data.payload } as PushMessage);
  }

  request<K extends keyof Requests>(kind: K, payload: Requests[K]["req"], timeoutMs: number): Promise<Requests[K]["res"]> {
    if (!this.alive || !this.target) return Promise.reject(new CancelledError(`${kind}: preview not connected`));
    const reqId = ++this.seq;
    const docId = this.docId!;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new TimeoutError(`${kind} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(reqId, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.target!.postMessage(envelope(docId, kind, payload, reqId), this.targetOrigin);
    });
  }

  send<K extends keyof Fires>(kind: K, payload: Fires[K]): void {
    if (!this.alive || !this.target) return;
    this.target.postMessage(envelope(this.docId!, kind, payload), this.targetOrigin);
  }

  dispose(): void {
    this.disposed = true;
    this.stopTimers();
    this.cancelAll();
  }

  private onHello(docId: string): void {
    if (docId === this.docId) return;
    const navigated = this.docId !== null;
    this.cancelAll(); // requests to the old document can never be answered
    this.docId = docId;
    this.lastHelloAt = Date.now();
    this.lastSeenAt = Date.now();
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
    this.request("init", { mode: this.mode() }, TIMEOUTS.connectMs).catch((err) => {
      if (!(err instanceof CancelledError)) this.die(new ConnectError("Couldn't connect to this preview"));
    });
    this.startHeartbeat();
    this.events.onReady(docId, navigated);
  }

  private armConnectTimer(): void {
    if (this.dead || this.disposed) return;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => this.die(new ConnectError("Couldn't connect to this preview")), TIMEOUTS.connectMs);
  }

  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      const now = Date.now();
      if (now - this.lastSeenAt > TIMEOUTS.heartbeatDeadMs) {
        this.die(new ConnectError("The preview stopped responding"));
        return;
      }
      if (now - this.lastPingAt >= TIMEOUTS.heartbeatPingMs) {
        this.lastPingAt = now;
        this.request("ping", {}, TIMEOUTS.heartbeatDeadMs).catch(() => {});
      }
    }, TIMEOUTS.heartbeatCheckMs);
  }

  private die(err: Error): void {
    if (this.dead || this.disposed) return;
    this.dead = true;
    this.stopTimers();
    this.cancelAll();
    this.events.onDead(err);
  }

  private stopTimers(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.connectTimer = null;
    this.heartbeat = null;
  }

  private cancelAll(): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new CancelledError("superseded"));
    }
    this.pending.clear();
  }
}

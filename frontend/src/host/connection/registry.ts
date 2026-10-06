import type { PreviewConnection } from "./PreviewConnection";

const connections = new Map<string, PreviewConnection>();
let routerInstalled = false;

export function setConnection(screenId: string, conn: PreviewConnection | null): void {
  if (conn) connections.set(screenId, conn);
  else connections.delete(screenId);
}

export function getConnection(screenId: string): PreviewConnection | undefined {
  return connections.get(screenId);
}

export function allConnections(): Iterable<PreviewConnection> {
  return connections.values();
}

/** One window listener routes each message to the connection whose iframe sent it. */
export function installRouter(): void {
  if (routerInstalled) return;
  routerInstalled = true;
  window.addEventListener("message", (e) => {
    for (const c of connections.values()) {
      if (c.matches(e.source)) {
        c.handle(e.data, e.origin);
        return;
      }
    }
  });
}

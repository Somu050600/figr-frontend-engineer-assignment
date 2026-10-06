import { useState } from "react";
import { getConnection } from "../connection/registry";
import { findRegion } from "../regions/registry";
import { useBoard } from "../state/board";
import { useSelection } from "../state/selection";
import { armOneShot, useFaults, type OneShot } from "./faults";

/** Dev-only: trigger each R6 failure on demand, for the video (R6.7). */
export function DevMenu() {
  const [open, setOpen] = useState(false);
  const screens = useBoard((s) => s.screens);
  const active = useSelection((s) => s.activeScreenId);
  const latency = useFaults((s) => s.latencyMs);
  const [picked, setPicked] = useState("");
  const target = picked || active || screens[0]?.id || "";
  const url = screens.find((s) => s.id === target)?.url;

  const oneShot = (kind: OneShot) => () => armOneShot(kind, target);
  const devFault = (fault: "silent" | "slowChildren" | "pageThrow") => () => getConnection(target)?.send("devFault", { fault });

  const actions: Array<[string, string, () => void]> = [
    ["Board", "GET /screens fails", () => {
      useFaults.setState((s) => ({ failNext: { ...s.failNext, screens: true } }));
      findRegion("board", null)?.retry();
    }],
    ["Preview", "Page doesn't load", () => {
      if (url) useFaults.setState((s) => ({ pageOverride: { ...s.pageOverride, [target]: new URL("/missing-page.html", url).toString() } }));
    }],
    ["Preview", "Script stops responding", devFault("silent")],
    ["Preview", "Page throws (badge)", devFault("pageThrow")],
    ["Preview", "Throw while drawing (select something)", oneShot("draw")],
    ["Preview", "Throw in next click handler", oneShot("click")],
    ["Preview", "Throw in next message handler", oneShot("message")],
    ["Preview", "Throw in next key handler", oneShot("key")],
    ["Preview", "Throw in a timer", () => findRegion("preview", target)?.setTimeout(() => {
      throw new Error("Dev: simulated error in a timer");
    }, 0)],
    ["Layers", "Row loads time out (expand a row)", devFault("slowChildren")],
    ["Layers", "Throw in render", () => useFaults.setState({ throwLayersRender: true })],
    ["Details", "Next request fails (5xx or malformed)", () => {
      useFaults.setState((s) => ({ failNext: { ...s.failNext, details: true } }));
      findRegion("details", target)?.retry();
    }],
    ["Inspector", "Throw in render", () => useFaults.setState({ throwInspectorRender: true })],
  ];

  return (
    <div className="dev">
      <button type="button" className="dev-toggle" onClick={() => setOpen((o) => !o)} onMouseDown={(e) => e.preventDefault()}>
        Dev ▾
      </button>
      {open && (
        <div className="dev-menu" data-chrome>
          <label>
            Target preview
            <select value={target} onChange={(e) => setPicked(e.target.value)}>
              {screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.id === active ? " (active)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            API latency
            <select value={latency} onChange={(e) => useFaults.setState({ latencyMs: Number(e.target.value) })}>
              {[0, 500, 2000, 5000].map((ms) => (
                <option key={ms} value={ms}>
                  {ms} ms
                </option>
              ))}
            </select>
          </label>
          {actions.map(([group, label, run]) => (
            <button key={label} type="button" onClick={run}>
              <span className="dev-group">{group}</span> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

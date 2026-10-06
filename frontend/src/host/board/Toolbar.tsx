import { DevMenu } from "../dev/DevMenu";
import { useBoard } from "../state/board";
import { useZoom } from "../state/viewport";

export function Toolbar() {
  const mode = useBoard((s) => s.mode);
  const zoom = useZoom();
  const setMode = useBoard((s) => s.setMode);
  // mousedown preventDefault keeps focus off the buttons, so Enter/Space stay shortcuts.
  const noFocus = (e: React.MouseEvent) => e.preventDefault();
  return (
    <header className="toolbar">
      <div className="brand">Figr viewer</div>
      <div className="seg" role="radiogroup" aria-label="Mode">
        <button type="button" role="radio" aria-checked={mode === "select"} onMouseDown={noFocus} onClick={() => setMode("select")}>
          Select <kbd>V</kbd>
        </button>
        <button type="button" role="radio" aria-checked={mode === "interact"} onMouseDown={noFocus} onClick={() => setMode("interact")}>
          Interact <kbd>I</kbd>
        </button>
      </div>
      <div className="zoom">{Math.round(zoom * 100)}%</div>
      <div className="spacer" />
      {import.meta.env.DEV && <DevMenu />}
    </header>
  );
}

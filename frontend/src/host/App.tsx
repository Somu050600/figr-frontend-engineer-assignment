import { useEffect } from "react";
import { installSync } from "./connection/sync";
import { useFaults } from "./dev/faults";
import { Board } from "./board/Board";
import { Toolbar } from "./board/Toolbar";
import { Inspector } from "./inspector/Inspector";
import { onHostKeyDown } from "./keyboard/shortcuts";
import { LayersPanel } from "./layers/LayersPanel";
import { Region } from "./regions/Region";
import { clearHover } from "./state/hover";
import { useSelection } from "./state/selection";

export function App() {
  const active = useSelection((s) => s.activeScreenId);
  const inspected = useSelection((s) => s.screenId);

  useEffect(() => {
    installSync();
    const onLeave = () => clearHover(); // R2.3: pointer leaves the window
    window.addEventListener("keydown", onHostKeyDown);
    window.addEventListener("blur", onLeave);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("keydown", onHostKeyDown);
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <main className="main">
        <Region name="board" screenId={null} className="board-region">
          <Board />
        </Region>
        <aside className="side">
          <section className="panel layers-panel">
            <h2>Layers</h2>
            <Region
              key={active ?? "none"}
              name="layers"
              screenId={active}
              onRetry={() => useFaults.setState({ throwLayersRender: false })}
            >
              <LayersPanel screenId={active} />
            </Region>
          </section>
          <section className="panel inspector-panel">
            <h2>Inspector</h2>
            <Region name="inspector" screenId={inspected ?? active} onRetry={() => useFaults.setState({ throwInspectorRender: false })}>
              <Inspector />
            </Region>
          </section>
        </aside>
      </main>
    </div>
  );
}

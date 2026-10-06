import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useFaults } from "../dev/faults";
import { Region } from "../regions/Region";
import { liveKey, useLive } from "../state/live";
import { useSelection } from "../state/selection";
import { Details } from "./Details";
import { formatLive, LIVE_FIELDS, mergeLive, type LiveRows } from "./fields";

export function Inspector() {
  if (useFaults((s) => s.throwInspectorRender)) throw new Error("Dev: simulated inspector render error");
  const { screenId, ids, goneNotice } = useSelection(useShallow((s) => ({ screenId: s.screenId, ids: s.ids, goneNotice: s.goneNotice })));

  if (!screenId || !ids.length) {
    return <div className="panel-empty">{goneNotice ? "This element no longer exists" : "Select an element to inspect"}</div>;
  }
  if (ids.length === 1) return <Single screenId={screenId} id={ids[0]} />;
  return <Multi screenId={screenId} ids={ids} />;
}

function Single({ screenId, id }: { screenId: string; id: string }) {
  const live = useLive((s) => s.byKey[liveKey(screenId, id)]);
  return (
    <div className="inspector">
      <section>
        <h3>Live</h3>
        {live ? <Fields rows={formatLive(live)} /> : <p className="muted">Reading from the page…</p>}
      </section>
      <section>
        <h3>Details</h3>
        {!live ? (
          <p className="muted">…</p>
        ) : live.key ? (
          <Region key={`${screenId}|${id}|${live.key}`} name="details" screenId={screenId} elementKey={live.key}>
            <Details elementKey={live.key} />
          </Region>
        ) : (
          <p className="muted">No details</p>
        )}
      </section>
    </div>
  );
}

function Multi({ screenId, ids }: { screenId: string; ids: string[] }) {
  const values = useLive(useShallow((s) => ids.map((id) => s.byKey[liveKey(screenId, id)] ?? null)));
  const rows = useMemo(() => {
    const ready = values.filter((v) => v !== null);
    return ready.length === ids.length ? mergeLive(ready.map(formatLive)) : null;
  }, [values, ids.length]);
  return (
    <div className="inspector">
      <section>
        <h3>{ids.length} elements</h3>
        {rows ? <Fields rows={rows} /> : <p className="muted">Reading from the page…</p>}
      </section>
    </div>
  );
}

function Fields({ rows }: { rows: LiveRows }) {
  return (
    <dl className="fields">
      {LIVE_FIELDS.map((f) => (
        <FieldRow key={f} label={f} value={rows[f]} />
      ))}
    </dl>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  const isColour = label === "Text colour" || label === "Background";
  return (
    <>
      <dt>{label}</dt>
      <dd className={value === "Mixed" ? "mixed" : undefined}>
        {isColour && value !== "Mixed" && <span className="swatch" style={{ background: value }} />}
        {value}
      </dd>
    </>
  );
}

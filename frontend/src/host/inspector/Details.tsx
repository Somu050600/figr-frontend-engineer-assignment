import { useEffect, useState } from "react";
import { fetchDetails, type ElementDetails } from "../api/elements";
import { useRegion } from "../regions/Region";

type State = { kind: "loading" } | { kind: "ok"; details: ElementDetails } | { kind: "missing" };

/**
 * Details from GET /elements/:key. Mounted with key = the selection, so a
 * selection change unmounts it and aborts the request: only the latest
 * selection's details can ever show (R5.3), and the abort is not a failure.
 */
export function Details({ elementKey }: { elementKey: string }) {
  const region = useRegion();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const ac = new AbortController();
    fetchDetails(elementKey, ac.signal).then(
      region.guard((details) => {
        if (!ac.signal.aborted) setState(details ? { kind: "ok", details } : { kind: "missing" });
      }),
      region.capture,
    );
    return () => ac.abort();
  }, [elementKey, region]);

  if (state.kind === "loading") return <p className="muted">Loading details…</p>;
  if (state.kind === "missing") return <p className="muted">No details for this element</p>;
  const d = state.details;
  return (
    <dl className="fields">
      <dt>Component</dt>
      <dd>{d.component}</dd>
      <dt>Description</dt>
      <dd>{d.description}</dd>
      <dt>Status</dt>
      <dd>
        <span className={`status-pill ${d.status}`}>{d.status}</span>
      </dd>
      <dt>Owner</dt>
      <dd>{d.owner}</dd>
    </dl>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { TIMEOUTS } from "../../protocol/messages";
import { getConnection } from "../connection/registry";
import { useFaults } from "../dev/faults";
import { useRegion } from "../regions/Region";
import { useHover } from "../state/hover";
import { usePreviews } from "../state/previews";
import { useSelection } from "../state/selection";
import { ensureChildren, retryRow, revealNode, setQuery, toggleRow } from "./controller";
import { arrowLeft, arrowRight, highlightFor, idOfKey, isNodeRow, ROOT, stepRow, visibleRows } from "./model";
import { INDENT, Row, ROW_H, StatusRow } from "./Row";
import { EMPTY_LAYERS, getLayers, updateLayers, useLayers } from "./store";

const NO_IDS: string[] = [];

export function LayersPanel({ screenId }: { screenId: string | null }) {
  if (!screenId) return <div className="panel-empty">Click something in a preview</div>;
  return <LayersTree screenId={screenId} />;
}

function LayersTree({ screenId }: { screenId: string }) {
  const region = useRegion();
  if (useFaults((s) => s.throwLayersRender)) throw new Error("Dev: simulated layers render error");

  const layers = useLayers((s) => s.byScreen[screenId] ?? EMPTY_LAYERS);
  const status = usePreviews((s) => s.byScreen[screenId]?.status ?? "connecting");
  const selIds = useSelection((s) => (s.screenId === screenId ? s.ids : NO_IDS));
  const hover = useHover((s) => (s.hover?.screenId === screenId ? s.hover : null));
  const { nodes, children, expanded, search } = layers;

  const rows = useMemo(() => visibleRows({ nodes, children, expanded, search }), [nodes, children, expanded, search]);
  const nodeRows = useMemo(() => rows.filter(isNodeRow), [rows]);
  const visible = useMemo(() => new Set(nodeRows.map((r) => r.id)), [nodeRows]);
  const selected = useMemo(() => new Set(selIds), [selIds]);
  const hoveredRow = hover ? highlightFor(hover.id, hover.ancestorIds, visible) : null;
  const last = selIds[selIds.length - 1] ?? null;
  const searching = !!search;

  const scrollRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ id: string; offset: number } | null>(null);
  const prevRows = useRef(rows);

  // Top level loads once the preview is connected (and again after navigation resets it).
  // Only when never requested: a failed load waits for the row's Retry (R4.3), it must
  // not re-fire on its own and report a new failure every 3s.
  const rootState = children[ROOT];
  useEffect(() => {
    if (status === "ready" && !getLayers(screenId).children[ROOT]) region.guard(ensureChildren)(screenId, null);
  }, [status, rootState, screenId, region]);

  // Selecting in the preview reveals the row, loading ancestors if needed (R4.5).
  useEffect(() => {
    if (!last || status !== "ready") return;
    if (visible.has(last)) updateLayers(screenId, (s) => ({ ...s, scrollToId: last }));
    else region.guard(revealNode)(screenId, last);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the selection changes
  }, [last, status, screenId]);

  const recordAnchor = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const i = Math.floor(el.scrollTop / ROW_H);
    const r = rows[i];
    anchor.current = r && isNodeRow(r) ? { id: r.id, offset: el.scrollTop - i * ROW_H } : null;
  }, [rows]);

  // Restore this preview's scroll position on activation; save it when switching away (R4.9).
  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const saved = getLayers(screenId);
    el.scrollTop = saved.scrollTop;
    el.scrollLeft = saved.scrollLeft;
    return () => {
      const top = el.scrollTop;
      const left = el.scrollLeft;
      if (useLayers.getState().byScreen[screenId]) updateLayers(screenId, (s) => ({ ...s, scrollTop: top, scrollLeft: left }));
    };
  }, [screenId]);

  // The preview navigated (its layers state was reset): start the new page at the top.
  useLayoutEffect(() => {
    if (rootState) return;
    const el = scrollRef.current!;
    el.scrollTop = 0;
    el.scrollLeft = 0;
    anchor.current = null;
  }, [rootState]);

  // When rows change under the user (page DOM changes), keep the first visible row where it was (R4.10).
  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const a = anchor.current;
    if (prevRows.current !== rows && a) {
      const i = rows.findIndex((r) => isNodeRow(r) && r.id === a.id);
      if (i >= 0) el.scrollTop = i * ROW_H + a.offset;
    }
    prevRows.current = rows;
    const target = layers.scrollToId;
    if (target) {
      const i = rows.findIndex((r) => isNodeRow(r) && r.id === target);
      if (i >= 0) {
        const top = i * ROW_H;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
        // Deep rows (page-5 goes 30 levels down) are wider than the panel: bring the name into view too.
        const indent = rows[i].depth * INDENT;
        if (indent < el.scrollLeft || indent > el.scrollLeft + el.clientWidth - 120) el.scrollLeft = Math.max(0, indent - 24);
      }
      updateLayers(screenId, (s) => ({ ...s, scrollToId: null }));
    }
    recordAnchor();
  }, [rows, layers.scrollToId, screenId, recordAnchor]);

  const onToggle = useCallback((id: string, open: boolean) => region.guard(toggleRow)(screenId, id, open), [region, screenId]);

  const onSelect = useCallback(
    (id: string, shift: boolean) =>
      region.guard(() => {
        useSelection.getState().select(screenId, [id], shift ? "toggle" : "replace");
        // Bring it into view inside that page only (R4.6). Timeouts are silent (D15).
        if (!shift) getConnection(screenId)?.request("scrollTo", { id }, TIMEOUTS.scrollToMs).catch(() => {});
      })(),
    [region, screenId],
  );

  const onHover = useCallback(
    (id: string | null) => {
      const h = useHover.getState();
      if (id) h.set({ screenId, id, source: "layers", ancestorIds: [] });
      else if (h.hover?.source === "layers" && h.hover.screenId === screenId) h.clear();
    },
    [screenId],
  );

  const onKeyDown = region.guard((e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    if (k !== "ArrowUp" && k !== "ArrowDown" && k !== "ArrowLeft" && k !== "ArrowRight") return;
    e.preventDefault();
    const current = last && visible.has(last) ? last : null;
    if (k === "ArrowUp" || k === "ArrowDown") {
      const next = stepRow(nodeRows, current, k === "ArrowDown" ? 1 : -1);
      if (next) onSelect(next, false);
      return;
    }
    if (!current || searching) return;
    const s = getLayers(screenId);
    const r = k === "ArrowRight" ? arrowRight(s, current) : arrowLeft(s, current);
    if ("expand" in r && r.expand) onToggle(r.expand, true);
    if ("collapse" in r && r.collapse) onToggle(r.collapse, false);
    if (r.select) onSelect(r.select, false);
  });

  return (
    <div className="layers">
      <input
        className="search"
        type="search"
        placeholder="Search layers"
        value={search?.q ?? ""}
        onChange={(e) => region.guard(setQuery)(screenId, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setQuery(screenId, "");
            e.currentTarget.blur();
          }
        }}
      />
      {layers.revealError && (
        <div className="banner" role="alert">
          Couldn't load the selected element
          <button type="button" className="link" onClick={() => region.guard(revealNode)(screenId, layers.revealError!)}>
            Retry
          </button>
        </div>
      )}
      <div
        className="layers-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="tree"
        aria-multiselectable
        onScroll={recordAnchor}
        onKeyDown={onKeyDown}
      >
        {status !== "ready" && !rows.length && <div className="panel-empty">{status === "error" ? "Preview unavailable" : "Connecting…"}</div>}
        {searching && search?.result && !nodeRows.length && <div className="panel-empty">No matches</div>}
        {rows.map((r) =>
          isNodeRow(r) ? (
            <Row
              key={r.id}
              row={r}
              selected={selected.has(r.id)}
              hovered={hoveredRow === r.id}
              searching={searching}
              onToggle={onToggle}
              onSelect={onSelect}
              onHover={onHover}
            />
          ) : (
            <StatusRow key={`${r.kind}:${r.parent}`} kind={r.kind} depth={r.depth} onRetry={() => region.guard(retryRow)(screenId, idOfKey(r.parent))} />
          ),
        )}
      </div>
    </div>
  );
}

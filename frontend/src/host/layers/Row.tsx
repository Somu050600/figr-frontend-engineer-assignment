import { memo } from "react";
import type { NodeRow } from "./model";

export const ROW_H = 24;
export const INDENT = 10;

interface RowProps {
  row: NodeRow;
  selected: boolean;
  hovered: boolean;
  searching: boolean;
  onToggle(id: string, open: boolean): void;
  onSelect(id: string, shift: boolean): void;
  onHover(id: string | null): void;
}

export const Row = memo(function Row({ row, selected, hovered, searching, onToggle, onSelect, onHover }: RowProps) {
  const cls = ["row", selected && "selected", hovered && "hovered", row.match && "match"].filter(Boolean).join(" ");
  return (
    <div
      className={cls}
      style={{ paddingLeft: 6 + row.depth * INDENT }}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={row.node.hasChildren ? row.expanded : undefined}
      onMouseEnter={() => onHover(row.id)}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => onSelect(row.id, e.shiftKey)}
    >
      {row.node.hasChildren && !searching ? (
        <button
          type="button"
          className="chev"
          tabIndex={-1}
          aria-label={row.expanded ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(row.id, !row.expanded);
          }}
        >
          {row.expanded ? "▾" : "▸"}
        </button>
      ) : (
        <span className="chev-space">{row.node.hasChildren ? "▾" : ""}</span>
      )}
      <span className="row-name">{row.node.name}</span>
    </div>
  );
});

interface StatusRowProps {
  kind: "loading" | "error";
  depth: number;
  onRetry(): void;
}

export function StatusRow({ kind, depth, onRetry }: StatusRowProps) {
  return (
    <div className={`row status ${kind}`} style={{ paddingLeft: 6 + depth * INDENT + 16 }}>
      {kind === "loading" ? (
        <span className="muted">Loading…</span>
      ) : (
        <>
          <span className="error-text">Couldn't load</span>
          <button type="button" className="link" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </div>
  );
}

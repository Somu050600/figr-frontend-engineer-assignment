interface Props {
  title: string;
  detail?: string;
  onRetry(): void;
  compact?: boolean;
}

export function RegionError({ title, detail, onRetry, compact }: Props) {
  return (
    <div className={compact ? "region-error compact" : "region-error"} role="alert" data-chrome>
      <strong>{title}</strong>
      {detail && !compact && <span className="detail">{detail}</span>}
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

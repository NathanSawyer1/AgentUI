import { formatUpdatedAt } from "../lib/refreshState";
import { Icon } from "./Icons";

export function RefreshButton({ loading, onClick, label = "Refresh" }: { loading: boolean; onClick: () => void; label?: string }) {
  return (
    <button className="panel-btn text" onClick={onClick} disabled={loading}>
      <Icon name={loading ? "spinner" : "refresh"} size={12} />
      {loading ? "Refreshing" : label}
    </button>
  );
}

export function RefreshMeta({ loading, updatedAt, stale }: { loading: boolean; updatedAt?: number; stale?: boolean }) {
  return (
    <div className={"refresh-meta" + (stale ? " stale" : "")}>
      <span>{loading ? "refreshing" : stale ? "stale" : "last updated"}</span>
      <strong>{formatUpdatedAt(updatedAt)}</strong>
    </div>
  );
}

export function RefreshError({ message, stale, onRetry }: { message: string; stale?: boolean; onRetry: () => void }) {
  if (!message) return null;
  return (
    <div className={"error-banner refresh-error" + (stale ? " stale" : "")}>
      <span>{stale ? "Showing stale data. " : ""}{message}</span>
      <button className="panel-btn text" onClick={onRetry}>
        <Icon name="refresh" size={12} />
        Retry
      </button>
    </div>
  );
}

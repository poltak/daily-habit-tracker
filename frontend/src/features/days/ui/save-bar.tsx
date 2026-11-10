import { formatLogicalDate } from "@app/common/features/core/utils/logical-date";

interface SaveBarProps {
  logicalDate: string;
  activityCount: number;
  saved: boolean;
  saving: boolean;
  deleting: boolean;
  /** True while the day is not ready, or a change waits for the server. */
  blocked: boolean;
  onSave: () => void;
  onDelete: () => void;
}

export function SaveBar({
  logicalDate,
  activityCount,
  saved,
  saving,
  deleting,
  blocked,
  onSave,
  onDelete,
}: SaveBarProps) {
  const busy = saving || deleting || blocked;
  return (
    <div className="save-bar" aria-busy={busy}>
      <div>
        <strong>
          {saved ? "Your entry is saved" : "Ready to save your day?"}
        </strong>
        <span>
          {formatLogicalDate({ date: logicalDate, style: "friendly" })} ·{" "}
          {activityCount} {activityCount === 1 ? "activity" : "activities"}
        </span>
      </div>
      <div className="save-actions">
        {saved && (
          <button
            type="button"
            className="ghost-button danger"
            disabled={busy}
            aria-busy={deleting}
            onClick={onDelete}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
        <button
          type="button"
          className={`primary-button${saved ? " is-saved" : ""}`}
          disabled={saved || busy}
          aria-busy={saving}
          onClick={onSave}
        >
          {saved ? "Saved" : "Save entry"}
        </button>
      </div>
    </div>
  );
}

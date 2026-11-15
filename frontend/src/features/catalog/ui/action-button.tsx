import type { MouseEvent } from "react";
import { MaterialIcon } from "../../core/ui/material-icon.js";

interface ActionButtonProps {
  label: string;
  icon: string;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** True in the summary of a group, where a click must not open or close the group. */
  inSummary?: boolean;
  onClick: () => void;
}

/** A round icon button of a management row. It shows a spinner while its change runs. */
export function ActionButton({
  label,
  icon,
  busy = false,
  disabled = false,
  danger = false,
  inSummary = false,
  onClick,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className={`tiny-button${danger ? " danger" : ""}`}
      aria-label={label}
      aria-busy={busy}
      disabled={disabled}
      onClick={(event: MouseEvent) => {
        if (inSummary) {
          event.preventDefault();
        }
        onClick();
      }}
    >
      {busy ? (
        <span className="spinner" aria-hidden="true" />
      ) : (
        <MaterialIcon name={icon} />
      )}
    </button>
  );
}

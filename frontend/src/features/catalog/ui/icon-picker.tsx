import { useEffect, useMemo, useRef } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import {
  ICON_CATEGORIES,
  IconPickerLogic,
  iconLabel,
} from "./icon-picker-logic.js";

interface IconPickerProps {
  /** "Activity" or "Goal". */
  kind: "Activity" | "Goal";
  /** The name of the item that gets the icon. */
  subject: string;
  currentIcon: string;
  /** True while the icon is stored. */
  isSaving: boolean;
  onSelect: (icon: string) => void;
  onClose: () => void;
}

/**
 * The dialog where the owner picks an icon. It is a modal `<dialog>`, so the
 * browser keeps the keyboard inside it, closes it with Escape, and returns the
 * focus to the button that opened it.
 */
export function IconPicker({
  kind,
  subject,
  currentIcon,
  isSaving,
  onSelect,
  onClose,
}: IconPickerProps) {
  const deps = useMemo(() => ({ storage: {}, services: {}, api: {} }), []);
  const { logic, state } = useLogic({ LogicClass: IconPickerLogic, deps });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    searchRef.current?.focus();
  }, []);

  const choices = logic.matches();
  const shown = choices.slice(0, state.visibleLimit);
  const hasMore = choices.length > state.visibleLimit;
  return (
    <dialog
      ref={dialogRef}
      className="icon-picker-backdrop"
      aria-labelledby="icon-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className="icon-picker-scrim"
        role="presentation"
        onMouseDown={onClose}
      />
      <section className="icon-picker">
        <div className="icon-picker-header">
          <div>
            <p className="eyebrow">{`${kind} icon`}</p>
            <h2 id="icon-picker-title">Choose an icon</h2>
            <p className="muted">{`For ${subject}`}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close icon picker"
            disabled={isSaving}
            onClick={onClose}
          >
            <MaterialIcon name="close" />
          </button>
        </div>
        <label className="search-field icon-picker-search">
          <MaterialIcon name="search" />
          <input
            ref={searchRef}
            placeholder="Search icons by name or category"
            aria-label="Search icons"
            value={state.query}
            onChange={(event) => logic.setQuery({ query: event.target.value })}
          />
        </label>
        <div
          className="icon-picker-categories"
          role="toolbar"
          aria-label="Icon categories"
        >
          {ICON_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={state.category === category ? "selected" : ""}
              aria-pressed={state.category === category}
              disabled={isSaving}
              onClick={() => logic.chooseCategory({ category })}
            >
              {category}
            </button>
          ))}
        </div>
        <p className="icon-picker-count" role={isSaving ? "status" : undefined}>
          {isSaving
            ? "Saving icon…"
            : `Showing ${shown.length} of ${choices.length} icons`}
        </p>
        {choices.length > 0 ? (
          <div className="icon-picker-grid" aria-label="Available icons">
            {shown.map((choice) => (
              <button
                key={choice.name}
                type="button"
                className={`icon-choice ${currentIcon === choice.name ? "selected" : ""}`}
                aria-label={
                  isSaving
                    ? "Saving icon…"
                    : `Use ${iconLabel(choice.name)} icon`
                }
                aria-pressed={currentIcon === choice.name}
                disabled={isSaving}
                onClick={() => onSelect(choice.name)}
              >
                <MaterialIcon name={choice.name} />
                <span>{iconLabel(choice.name)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-inline">No icons match that search.</div>
        )}
        {hasMore && (
          <button
            type="button"
            className="ghost-button icon-picker-more"
            disabled={isSaving}
            onClick={() => logic.showMore()}
          >
            Show more icons
          </button>
        )}
      </section>
    </dialog>
  );
}

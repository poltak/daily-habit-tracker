import { formatLogicalDate } from "@app/common/features/core/utils/logical-date";
import { useRef } from "react";
import { addDays } from "@app/common/features/core/utils/logical-date";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import { useLogicInstance } from "../../core/logic/use-logic.js";
import { useJournal } from "./journal-context.js";

/** The day switcher of the header: the arrows, the day, and the swipe on them. */
export function LogDateSwitcher() {
  const { logic, state } = useJournal();
  const swipe = useLogicInstance(logic.plugins.swipe);
  const { selectedDate, loadDayState } = state;
  if (!selectedDate) {
    return "Your journal";
  }
  const loading = loadDayState === "running";
  const latest = logic.isLatestDay();
  const move = (amount: number) =>
    void logic.chooseDate({ logicalDate: addDays(selectedDate, amount) });
  return (
    <div
      className="topbar-date-switcher"
      aria-label="Choose the journal day"
      aria-live="polite"
      onTouchStart={(event) => {
        const touch = event.touches.length === 1 ? event.touches[0] : undefined;
        if (touch) {
          logic.beginSwipe({ x: touch.clientX, y: touch.clientY });
        }
      }}
      onTouchMove={(event) => {
        const touch = event.touches[0];
        if (touch) {
          logic.moveSwipe({ x: touch.clientX });
        }
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        void logic.endSwipe(
          touch ? { x: touch.clientX, y: touch.clientY } : null,
        );
      }}
      onTouchCancel={() => void logic.endSwipe(null)}
    >
      <button
        type="button"
        aria-label="Previous day"
        disabled={loading}
        onClick={() => move(-1)}
      >
        <MaterialIcon name="chevron_left" />
      </button>
      <span
        className="topbar-date-label"
        style={
          swipe.pull ? { transform: `translateX(${swipe.pull}px)` } : undefined
        }
      >
        {formatLogicalDate({ date: selectedDate, style: "friendly" })}
      </span>
      <button
        type="button"
        aria-label="Next day"
        className={latest ? "at-latest-day" : undefined}
        disabled={loading || latest}
        onClick={() => move(1)}
      >
        <MaterialIcon name="chevron_right" />
      </button>
    </div>
  );
}

/** The Today button, and the button and the field that pick a date. */
export function LogDateActions() {
  const { logic, state } = useJournal();
  const input = useRef<HTMLInputElement>(null);
  const loading = state.loadDayState === "running";
  if (!state.selectedDate) {
    return null;
  }
  const openPicker = () => {
    const field = input.current;
    try {
      field?.showPicker();
    } catch {
      // Older browsers do not expose showPicker(). A tap still opens their date control.
      field?.focus();
      field?.click();
    }
  };
  return (
    <div className="topbar-actions">
      <button
        type="button"
        disabled={loading}
        onClick={() => void logic.chooseDate({ logicalDate: state.today })}
      >
        Today
      </button>
      <button
        type="button"
        className="topbar-calendar"
        aria-label="Choose a date"
        disabled={loading}
        onClick={openPicker}
      >
        <MaterialIcon name="calendar_month" />
      </button>
      <input
        ref={input}
        className="topbar-calendar-input"
        type="date"
        tabIndex={-1}
        aria-label="Journal date"
        value={state.selectedDate}
        max={state.today}
        disabled={loading}
        onChange={(event) =>
          void logic.chooseDate({ logicalDate: event.target.value })
        }
      />
    </div>
  );
}

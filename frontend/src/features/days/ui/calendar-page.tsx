import { useMemo, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import {
  formatLogicalDate,
  formatMonth,
  weekdayOrder,
  WEEKDAY_NAMES,
} from "@app/common/features/core/utils/logical-date";
import { monthCells } from "@app/common/features/days/utils/month-grid";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import { errorNotice, noticeText } from "../utils/journal-messages.js";
import { CalendarLogic } from "./calendar-logic.js";
import { useJournal } from "./journal-context.js";
import { MoodFace } from "../../core/ui/mood-face.js";
import { useLogicInstance } from "../../core/logic/use-logic.js";

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

function dayLabel({
  date,
  moodName,
  hasEntry,
  notStarted,
}: {
  date: string;
  moodName: string | undefined;
  hasEntry: boolean;
  notStarted: boolean;
}): string {
  const day = formatLogicalDate({ date, style: "friendly" });
  if (moodName) {
    return `${day}, ${moodName} mood, entry exists`;
  }
  if (hasEntry) {
    return `${day}, entry exists`;
  }
  return `${day}, ${notStarted ? "not started" : "empty"}`;
}

/** One month of days. Each day with an entry shows its mood, and each day that has started opens its log. */
export function CalendarPage({ weekEndsOn }: { weekEndsOn: number }) {
  const app = useFrontendApp();
  const journal = useJournal();
  const catalog = useLogicInstance(journal.logic.plugins.catalog);
  const navigate = useNavigate();
  const { selectedDate } = journal.state;
  const deps = useMemo(
    () => ({
      storage: {},
      services: { clock: app.services.clock },
      api: { calendar: app.api.calendar },
      initialMonth: selectedDate.slice(0, 7),
    }),
    // oxlint-disable-next-line react/exhaustive-deps -- The month on show is the one of the open day at the moment the calendar opens.
    [app],
  );
  const { logic, state } = useLogic({ LogicClass: CalendarLogic, deps });
  const loading = state.loadMonthState === "running";
  const moods = new Map(catalog.moods.map((mood) => [mood.id, mood]));
  const entries = new Map(state.days.map((day) => [day.logicalDate, day]));
  const today = journal.state.today;
  return (
    <section className="page-section calendar-page">
      <div className="page-intro">
        <p className="eyebrow">Your history</p>
        <h1>Calendar</h1>
        <p className="muted">
          Each entry day shows its mood. Select today or an earlier day to open
          or add its check-in.
        </p>
      </div>
      {state.loadMonthError && (
        <output className="notice error">
          {noticeText(errorNotice(state.loadMonthError))}
        </output>
      )}
      <section className="calendar-card">
        <div className="calendar-heading">
          <button
            type="button"
            className="icon-button"
            aria-label={loading ? "Loading month" : "Previous month"}
            aria-busy={loading}
            disabled={loading}
            onClick={() => void logic.showMonth({ amount: -1 })}
          >
            {loading ? <Spinner /> : <MaterialIcon name="chevron_left" />}
          </button>
          <h2>{formatMonth(state.month)}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={loading ? "Loading month" : "Next month"}
            aria-busy={loading}
            disabled={loading || state.month >= state.currentMonth}
            onClick={() => void logic.showMonth({ amount: 1 })}
          >
            {loading ? <Spinner /> : <MaterialIcon name="chevron_right" />}
          </button>
        </div>
        <div className="calendar-weekdays">
          {weekdayOrder(weekEndsOn).map((weekday) => (
            <span key={weekday}>{WEEKDAY_NAMES[weekday]?.slice(0, 3)}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {monthCells({ month: state.month, weekEndsOn }).map((date, index) => {
            if (!date) {
              return <span key={`blank-${index}`} className="calendar-blank" />;
            }
            const entry = entries.get(date);
            const mood = entry ? moods.get(entry.moodId) : undefined;
            const notStarted = date > today;
            return (
              <button
                key={date}
                type="button"
                className={`calendar-day ${entry ? "filled" : ""} ${date === today ? "today" : ""} ${notStarted ? "not-started" : ""}`}
                style={
                  mood
                    ? ({ "--calendar-mood-color": mood.color } as CSSProperties)
                    : undefined
                }
                disabled={notStarted}
                aria-label={dayLabel({
                  date,
                  moodName: mood?.name,
                  hasEntry: entry !== undefined,
                  notStarted,
                })}
                onClick={() => {
                  navigate("/");
                  void journal.logic.chooseDate({ logicalDate: date });
                }}
              >
                <span>{Number(date.slice(-2))}</span>
                {mood && (
                  <MoodFace
                    score={mood.score}
                    color={mood.color}
                    className="calendar-mood-emoji"
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="calendar-legend">
          <span>
            <i className="legend-dot filled" /> Entry with mood
          </span>
          <span>
            <i className="legend-dot" /> Empty
          </span>
        </div>
        {loading && (
          <output className="calendar-loading">Checking this month…</output>
        )}
      </section>
    </section>
  );
}

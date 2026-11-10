import { formatLogicalDate } from "@app/common/features/core/utils/logical-date";
import { useLogicInstance } from "../../core/logic/use-logic.js";
import { noticeText } from "../utils/journal-messages.js";
import { ActivitiesPanel } from "./activities-panel.js";
import { GoalsPanel } from "./goals-panel.js";
import { useJournal } from "./journal-context.js";
import { MoodPanel } from "./mood-panel.js";
import { SaveBar } from "./save-bar.js";

interface LogPageProps {
  onOpenGoal: (goalId: string) => void;
  onAddActivity: (groupId: string) => void;
}

function heading({
  selectedDate,
  today,
  yesterday,
}: {
  selectedDate: string;
  today: string;
  yesterday: string;
}): string {
  if (selectedDate === today) {
    return "How was your day?";
  }
  if (selectedDate === yesterday) {
    return "How was yesterday?";
  }
  return `How was ${formatLogicalDate({ date: selectedDate, style: "long" })}?`;
}

/** The daily entry: the goals, the mood, the activities, and the save bar. */
export function LogPage({ onOpenGoal, onAddActivity }: LogPageProps) {
  const { logic, state } = useJournal();
  const catalog = useLogicInstance(logic.plugins.catalog);
  const selection = useLogicInstance(logic.plugins.selection);
  const actions = useLogicInstance(logic.plugins.entryActions);
  const { selectedDate, loadedDate, loadDayState, draft, notice } = state;

  if (catalog.loadCatalogState === "error") {
    return (
      <div className="journal-loading">
        <div className="notice error" role="alert">
          <p>{catalog.loadCatalogError}</p>
          <button
            type="button"
            className="loading-retry"
            onClick={() => void logic.loadJournal()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!selectedDate || catalog.loadCatalogState !== "success") {
    return (
      <div className="journal-loading" aria-busy="true">
        <output className="sr-only">Loading journal data…</output>
        <section className="hero-card">
          <div>
            <p className="eyebrow">Daily journal</p>
            <h1>How was your day?</h1>
            <div
              className="loading-placeholder loading-line"
              aria-hidden="true"
            />
          </div>
        </section>
      </div>
    );
  }

  const loading = loadDayState === "running";
  const ready = loadedDate === selectedDate;
  const saving = actions.saveState === "running";
  const deleting = actions.deleteState === "running";
  const formBusy = saving || deleting;
  const selecting = selection.pending !== null;
  const unavailable = loading || !ready || selecting;
  const pending = selection.pending;
  const tappedGoal =
    pending?.kind === "goal"
      ? catalog.goals.find((goal) => goal.id === pending.id)
      : undefined;
  // A goal follows its activity, and a tap on either one saves both.
  const pendingActivityId =
    pending?.kind === "activity"
      ? pending.id
      : (tappedGoal?.activityId ?? null);
  const pendingGoalIds = new Set(
    catalog.goals
      .filter(
        (goal) =>
          goal.id === tappedGoal?.id ||
          (pendingActivityId && goal.activityId === pendingActivityId),
      )
      .map((goal) => goal.id),
  );
  return (
    <>
      <fieldset className="log-form" disabled={formBusy} aria-busy={formBusy}>
        <legend className="sr-only">Daily entry form</legend>
        {selecting && (
          <output className="sr-only">
            Saving your mood or activity selection…
          </output>
        )}
        {formBusy && (
          <output className="sr-only">
            Daily entry form disabled while {deleting ? "deleting" : "saving"}.
          </output>
        )}
        <section className="hero-card">
          <div>
            <p className="eyebrow">Your daily check-in</p>
            <h1>{heading(state)}</h1>
            <p className="muted">Take a breath. Unclench.</p>
          </div>
        </section>
        {notice && (
          <output className={`notice ${notice.kind}`}>
            {noticeText(notice)}
          </output>
        )}
        {!loading && !ready && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => void logic.chooseDate({ logicalDate: selectedDate })}
          >
            Retry day
          </button>
        )}
        <GoalsPanel
          goals={catalog.goals}
          activities={catalog.activities}
          completedGoalIds={draft.completedGoalIds}
          pendingGoalIds={pendingGoalIds}
          loading={loading || !ready}
          busy={selecting}
          onOpen={onOpenGoal}
          onToggle={(goalId) => void logic.toggleGoal({ goalId })}
        />
        <MoodPanel
          moods={catalog.moods}
          chosenMoodId={draft.moodId}
          busy={loading || selecting}
          unavailable={unavailable}
          onChoose={(moodId) => void logic.toggleMood({ moodId })}
        />
        <ActivitiesPanel
          groups={catalog.groups}
          activities={catalog.activities}
          selectedActivityIds={draft.activityIds}
          query={state.activityQuery}
          openGroupIds={state.openGroupIds}
          pendingActivityId={pendingActivityId}
          loading={loading}
          unavailable={unavailable}
          onQueryChange={(query) => logic.setActivityQuery({ query })}
          onToggle={(activityId) => void logic.toggleActivity({ activityId })}
          onGroupOpen={(input) => logic.setGroupOpen(input)}
          onAddActivity={onAddActivity}
        />
      </fieldset>
      <SaveBar
        logicalDate={selectedDate}
        activityCount={draft.activityIds.length}
        saved={state.entry !== null}
        saving={saving}
        deleting={deleting}
        blocked={!ready || loading || selecting}
        onSave={() => void logic.saveEntry()}
        onDelete={() => void logic.deleteEntry()}
      />
    </>
  );
}

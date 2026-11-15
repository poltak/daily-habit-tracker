import type { Activity, Mood } from "@app/common/features/catalog/types";
import { WEEKDAY_NAMES } from "@app/common/features/core/utils/logical-date";
import {
  ACTIVITY_PAIR_GROUPS,
  type ActivityMoodAssociation,
  type ActivityPairGroup,
} from "@app/common/features/insights/utils/relationship-types";
import type { RelationshipView } from "../utils/relationship-view.js";
import {
  displayActivityName,
  distributionLine,
  formatDifference,
  pairLabel,
} from "../utils/relationship-format.js";
import type { InsightsLogic } from "./insights-logic.js";
import { MeanBars, SummaryCard } from "./mood-distribution.js";

const PAIR_GROUP_LABELS: Record<ActivityPairGroup, string> = {
  neither: "Neither activity",
  aOnly: "A only",
  bOnly: "B only",
  both: "Both activities",
};

interface SectionProps {
  logic: InsightsLogic;
  view: RelationshipView;
  moods: readonly Mood[];
  hasDays: boolean;
}

function differenceClass(association: ActivityMoodAssociation): string {
  return association.meanDifference !== null && association.meanDifference >= 0
    ? "positive"
    : "negative";
}

function ActivityOptions({
  activities,
  without,
}: {
  activities: readonly Activity[];
  without?: string;
}) {
  return activities
    .filter((activity) => activity.id !== without)
    .map((activity) => (
      <option key={activity.id} value={activity.id}>
        {displayActivityName(activity)}
      </option>
    ));
}

function ActivitiesSection({ logic, view, moods, hasDays }: SectionProps) {
  const activityById = new Map(
    view.activities.map((activity) => [activity.id, activity]),
  );
  const selectedActivity = activityById.get(view.activityId);
  const selected = view.selectedAssociation;
  return (
    <section
      id="insights-activities"
      className="insights-card insight-rel-section"
    >
      <div className="insights-card-heading insight-rel-heading">
        <div>
          <p className="insights-kicker">Activity associations</p>
          <h2>Which activities show up with better moods?</h2>
        </div>
      </div>
      <p className="insights-help">
        This ranks logged activities by the difference in average mood on days
        they were recorded versus days they were not. It describes an
        association in your entries and cannot show that an activity caused a
        mood.
      </p>
      <div className="insight-rel-controls">
        <label className="insights-field">
          <span>Year</span>
          <select
            className="insights-select"
            value={view.year}
            onChange={(event) =>
              logic.chooseRelationshipYear({ value: event.target.value })
            }
          >
            <option value="all">All years</option>
            {view.years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="insights-field">
          <span>Weekday</span>
          <select
            className="insights-select"
            value={logic.state.relationshipWeekday}
            onChange={(event) =>
              logic.chooseRelationshipWeekday({ value: event.target.value })
            }
          >
            <option value="all">All weekdays</option>
            {WEEKDAY_NAMES.map((item, index) => (
              <option key={item} value={index}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="insights-field insight-rel-activity-picker">
          <span>Activity detail</span>
          <select
            className="insights-select"
            value={view.activityId}
            onChange={(event) =>
              logic.chooseActivity({ activityId: event.target.value })
            }
            disabled={!view.activities.length}
          >
            <ActivityOptions activities={view.activities} />
          </select>
        </label>
      </div>
      <div className="insight-rel-association-layout">
        <div className="insight-rel-ranking-panel">
          <div className="insight-rel-subheading">
            <h3>Ranked associations</h3>
            <span>
              {view.associations.length
                ? `${view.associations.length} with mood data`
                : "No data"}
            </span>
          </div>
          {view.associations.length ? (
            <div
              className="insight-rel-ranking-list"
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- No element has this role without a visible border or legend.
              role="group"
              aria-label="Activity mood associations"
            >
              {view.associations.map((association, index) => {
                const activity = activityById.get(association.activityId);
                const isSelected = association.activityId === view.activityId;
                return (
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    className={`insight-rel-ranking-row ${isSelected ? "selected" : ""}`}
                    key={association.activityId}
                    onClick={() =>
                      logic.chooseActivity({
                        activityId: association.activityId,
                      })
                    }
                  >
                    <span className="insight-rel-rank">{index + 1}</span>
                    <span
                      className="insight-rel-activity-icon material-symbols-rounded"
                      aria-hidden="true"
                    >
                      {activity?.icon || "check_circle"}
                    </span>
                    <span className="insight-rel-ranking-copy">
                      <strong>
                        {activity
                          ? displayActivityName(activity)
                          : association.activityId}
                      </strong>
                      <small>
                        {association.recorded.sampleSize} recorded ·{" "}
                        {association.notRecorded.sampleSize} not recorded
                        {association.sparse ? " · sparse" : ""}
                      </small>
                    </span>
                    <span
                      className={`insight-rel-ranking-delta ${differenceClass(association)}`}
                    >
                      {formatDifference(association.meanDifference)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="insights-empty">
              {!hasDays || moods.length === 0
                ? "Log days with a known mood to see activity associations."
                : "There are no known mood observations in this filter."}
            </p>
          )}
        </div>
        <div className="insight-rel-detail-panel">
          <div className="insight-rel-subheading">
            <div>
              <h3>
                {selectedActivity
                  ? displayActivityName(selectedActivity)
                  : "Activity detail"}
              </h3>
              <p>Recorded versus not recorded</p>
            </div>
            {selected ? (
              <strong
                className={`insight-rel-detail-delta ${differenceClass(selected)}`}
              >
                {formatDifference(selected.meanDifference)}
              </strong>
            ) : null}
          </div>
          {selected &&
          (selected.recorded.sampleSize || selected.notRecorded.sampleSize) ? (
            <div className="insight-rel-summary-grid">
              <SummaryCard
                title="Activity recorded"
                summary={selected.recorded}
                moods={moods}
              />
              <SummaryCard
                title="Activity not recorded"
                summary={selected.notRecorded}
                moods={moods}
              />
            </div>
          ) : (
            <p className="insights-empty">
              Select an activity with known mood observations to inspect both
              distributions.
            </p>
          )}
          {selected?.sparse ? (
            <p className="insight-rel-sparse-note">
              This comparison is sparse (
              {selected.sparseGroups
                .map(
                  (group) =>
                    `${group === "recorded" ? "recorded" : "not recorded"} n=${selected[group].sampleSize}`,
                )
                .join(" · ")}
              ); treat the displayed association as exploratory.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function NextDaySection({ logic, view, moods }: SectionProps) {
  const selectedActivity = view.activities.find(
    (activity) => activity.id === view.activityId,
  );
  const comparison = view.calendarComparison;
  return (
    <section
      id="insights-next-day"
      className="insights-card insight-rel-section"
    >
      <div className="insights-card-heading insight-rel-heading">
        <div>
          <p className="insights-kicker">Calendar-day window</p>
          <h2>What happens around an activity day?</h2>
        </div>
      </div>
      <p className="insights-help">
        For each anchor day, this compares the previous, same, next, and
        two-days-after calendar dates in the selected insights range. Dates are
        matched exactly; missing dates are omitted and never replaced by the
        next logged row.
      </p>
      <label className="insights-field insight-rel-window-picker">
        <span>Activity</span>
        <select
          className="insights-select"
          value={view.activityId}
          onChange={(event) =>
            logic.chooseActivity({ activityId: event.target.value })
          }
          disabled={!view.activities.length}
        >
          <ActivityOptions activities={view.activities} />
        </select>
      </label>
      {comparison && selectedActivity ? (
        <>
          <div className="insight-rel-window-meta">
            <span>
              <strong>{displayActivityName(selectedActivity)}</strong> anchor
              days
            </span>
            <span>
              {comparison.anchorCounts.recorded} recorded ·{" "}
              {comparison.anchorCounts.notRecorded} not recorded
            </span>
          </div>
          <div className="insight-rel-window-list">
            {comparison.offsets.map((offset) => (
              <article className="insight-rel-window-row" key={offset.offset}>
                <div className="insight-rel-window-title">
                  <h3>{offset.label}</h3>
                  <p>
                    {offset.recorded.sampleSize + offset.notRecorded.sampleSize}{" "}
                    exact mood observations
                  </p>
                </div>
                <MeanBars
                  recorded={offset.recorded}
                  notRecorded={offset.notRecorded}
                />
                <div className="insight-rel-window-distributions">
                  <div>
                    <strong>Recorded on anchor</strong>
                    <span>{distributionLine(offset.recorded, moods)}</span>
                  </div>
                  <div>
                    <strong>Not recorded on anchor</strong>
                    <span>{distributionLine(offset.notRecorded, moods)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="insights-empty">
          Choose an activity to compare exact calendar-day windows.
        </p>
      )}
    </section>
  );
}

function CombinationsSection({ logic, view, moods }: SectionProps) {
  const activityById = new Map(
    view.activities.map((activity) => [activity.id, activity]),
  );
  const pair = view.selectedPair;
  return (
    <section
      id="insights-combinations"
      className="insights-card insight-rel-section"
    >
      <div className="insights-card-heading insight-rel-heading">
        <div>
          <p className="insights-kicker">Activity combinations</p>
          <h2>Which pairs have a useful mood split?</h2>
        </div>
      </div>
      <p className="insights-help">
        Suggestions appear only when each of four groups has at least 10 known
        mood observations: neither activity, A only, B only, and both. Pair
        differences describe logged-day associations and do not establish
        causation.
      </p>
      {view.suggestions.length ? (
        <div
          className="insight-rel-pair-suggestions"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- No element has this role without a visible border or legend.
          role="group"
          aria-label="Suggested activity pairs"
        >
          {view.suggestions.map((suggestion) => (
            <button
              type="button"
              aria-pressed={pair?.pairKey === suggestion.pairKey}
              className={`insight-rel-pair-suggestion ${pair?.pairKey === suggestion.pairKey ? "selected" : ""}`}
              key={suggestion.pairKey}
              onClick={() =>
                logic.choosePair({
                  activityAId: suggestion.activityAId,
                  activityBId: suggestion.activityBId,
                })
              }
            >
              <span
                className="insight-rel-pair-suggestion-icon material-symbols-rounded"
                aria-hidden="true"
              >
                compare_arrows
              </span>
              <span>
                <strong>{pairLabel({ pair: suggestion, activityById })}</strong>
                <small>
                  {suggestion.meanRange === null
                    ? "No mean range"
                    : `${suggestion.meanRange.toFixed(2)} point spread across groups`}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="insights-empty">
          No pair meets the 10-observation threshold in all four groups yet. You
          can still explore a sparse pair below.
        </p>
      )}
      <div className="insight-rel-pair-picker-wrap">
        <label className="insights-field">
          <span>First activity</span>
          <select
            className="insights-select"
            value={view.pairActivityAId}
            onChange={(event) =>
              logic.chooseFirstOfPair({ activityId: event.target.value })
            }
            disabled={view.activities.length < 2}
          >
            <ActivityOptions
              activities={view.activities}
              without={view.pairActivityBId}
            />
          </select>
        </label>
        <label className="insights-field">
          <span>Second activity</span>
          <select
            className="insights-select"
            value={view.pairActivityBId}
            onChange={(event) =>
              logic.chooseSecondOfPair({ activityId: event.target.value })
            }
            disabled={view.activities.length < 2}
          >
            <ActivityOptions
              activities={view.activities}
              without={view.pairActivityAId}
            />
          </select>
        </label>
      </div>
      {pair ? (
        <div className="insight-rel-pair-detail">
          <div className="insight-rel-subheading">
            <div>
              <h3>{pairLabel({ pair, activityById })}</h3>
              <p>Compare the four logged-day groups</p>
            </div>
            <span
              className={`insight-rel-adequacy ${pair.adequate ? "adequate" : "sparse"}`}
            >
              {pair.adequate
                ? "Adequate sample"
                : `Sparse: ${pair.sparseGroups.length} group${pair.sparseGroups.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="insight-rel-pair-grid">
            {ACTIVITY_PAIR_GROUPS.map((group) => (
              <SummaryCard
                key={group}
                title={
                  group === "aOnly"
                    ? `${activityById.get(pair.activityAId)?.name ?? "A"} only`
                    : group === "bOnly"
                      ? `${activityById.get(pair.activityBId)?.name ?? "B"} only`
                      : PAIR_GROUP_LABELS[group]
                }
                summary={pair.groups[group]}
                moods={moods}
                compact
              />
            ))}
          </div>
          {!pair.adequate ? (
            <p className="insight-rel-sparse-note">
              This pair is available for manual exploration, but the small
              group(s) make its distribution unstable:{" "}
              {pair.sparseGroups
                .map(
                  (group) =>
                    `${PAIR_GROUP_LABELS[group]} n=${pair.sampleSizes[group]}`,
                )
                .join(" · ")}
              .
            </p>
          ) : null}
        </div>
      ) : (
        <p className="insights-empty">
          Add at least two activities and log days with known moods to explore
          combinations.
        </p>
      )}
    </section>
  );
}

/** The sections about what activities do to the mood. */
export function RelationshipSections(props: SectionProps) {
  return (
    <div className="insight-relations">
      <ActivitiesSection {...props} />
      <NextDaySection {...props} />
      <CombinationsSection {...props} />
    </div>
  );
}

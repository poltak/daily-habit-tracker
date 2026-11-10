import type {
  Activity,
  ActivityGroup,
} from "@app/common/features/catalog/types";
import { filterActivityGroups } from "@app/common/features/catalog/utils/activity-groups";
import { MaterialIcon } from "../../core/ui/material-icon.js";

const GROUP_ICONS: Record<string, string> = {
  social: "diversity_3",
  hobbies: "toys_and_games",
  health: "favorite",
  study: "menu_book",
  productivity: "work",
  vices: "favorite",
  everyday: "door_open",
  substances: "nutrition",
  emotions: "adjust",
  people: "group",
  work: "business_center",
  home: "home",
  leisure: "sports_esports",
};

function countLabel(count: number): string {
  return `${count} ${count === 1 ? "activity" : "activities"}`;
}

interface ActivitiesPanelProps {
  groups: readonly ActivityGroup[];
  activities: readonly Activity[];
  selectedActivityIds: readonly string[];
  query: string;
  openGroupIds: readonly string[];
  /** The activity that waits for the server. */
  pendingActivityId: string | null;
  /** True while the day loads. */
  loading: boolean;
  /** True while the day loads or fails to load, or a tap waits for the server. */
  unavailable: boolean;
  onQueryChange: (query: string) => void;
  onToggle: (activityId: string) => void;
  onGroupOpen: (input: { groupId: string; open: boolean }) => void;
  onAddActivity: (groupId: string) => void;
}

export function ActivitiesPanel({
  groups,
  activities,
  selectedActivityIds,
  query,
  openGroupIds,
  pendingActivityId,
  loading,
  unavailable,
  onQueryChange,
  onToggle,
  onGroupOpen,
  onAddActivity,
}: ActivitiesPanelProps) {
  const results = filterActivityGroups({ groups, activities, query });
  const searching = query.trim().length > 0;
  const selected = new Set(selectedActivityIds);
  const chips = selectedActivityIds.flatMap(
    (id) => activities.find((activity) => activity.id === id) ?? [],
  );
  return (
    <section className="panel activities-panel" aria-busy={loading}>
      <div className="section-heading">
        <h2>Activities</h2>
        <span className="selection-count">
          {selectedActivityIds.length} selected
        </span>
      </div>
      <fieldset className="selection-row" aria-label="Selected activities">
        {chips.length === 0 ? (
          <span className="selection-empty">
            Selected activities appear here.
          </span>
        ) : (
          chips.map((activity) => (
            <button
              key={activity.id}
              type="button"
              className="selection-chip"
              disabled={unavailable}
              aria-busy={pendingActivityId === activity.id}
              onClick={() => onToggle(activity.id)}
            >
              <MaterialIcon name={activity.icon} /> {activity.name}{" "}
              <span>
                <MaterialIcon name="close" />
              </span>
            </button>
          ))
        )}
      </fieldset>
      <label className="search-field">
        <MaterialIcon name="search" />
        <input
          placeholder="Search your activities"
          aria-label="Search activities"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      {loading && (
        <output className="inline-loading">
          Loading this day’s selections…
        </output>
      )}
      {results.length === 0 ? (
        <p className="empty-inline">No activities match that search.</p>
      ) : (
        <div className="activity-groups">
          {results.map(({ group, activities: groupActivities }) => (
            <details
              key={group.id}
              aria-label={group.name}
              open={searching || openGroupIds.includes(group.id)}
              onToggle={(event) => {
                if (!searching) {
                  onGroupOpen({
                    groupId: group.id,
                    open: event.currentTarget.open,
                  });
                }
              }}
            >
              <summary>
                <span className="group-title">
                  <span className="group-icon">
                    <MaterialIcon
                      name={GROUP_ICONS[group.name.toLowerCase()] ?? "category"}
                    />
                  </span>
                  {group.name}
                </span>
                <span className="group-summary-meta">
                  <button
                    type="button"
                    className="add-activity-button"
                    aria-label={`Add new activity to ${group.name}`}
                    onClick={(event) => {
                      // The button is inside the summary. Its click must not open or close the group.
                      event.preventDefault();
                      onAddActivity(group.id);
                    }}
                  >
                    + Add new
                  </button>
                  <span>{countLabel(groupActivities.length)}</span>
                  <MaterialIcon
                    name="expand_more"
                    className="group-expand-icon"
                  />
                </span>
              </summary>
              <div className="activity-grid">
                {groupActivities.map((activity) => {
                  const isSelected = selected.has(activity.id);
                  const pending = pendingActivityId === activity.id;
                  return (
                    <button
                      key={activity.id}
                      type="button"
                      className={`activity-button ${isSelected ? "selected" : ""}`}
                      aria-pressed={isSelected}
                      aria-busy={pending}
                      disabled={unavailable}
                      onClick={() => onToggle(activity.id)}
                    >
                      <span className="activity-icon">
                        <MaterialIcon name={activity.icon} />
                      </span>
                      <span>{activity.name}</span>
                      {isSelected && (
                        <span className="check-mark">
                          <MaterialIcon name="check" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

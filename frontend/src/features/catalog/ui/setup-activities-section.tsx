import type { Activity } from "@app/common/features/catalog/types";
import type { ActivityGroupResult } from "@app/common/features/catalog/utils/activity-groups";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import { actionKey, reorderKey } from "../utils/catalog-mutations.js";
import { buildSetupView } from "../utils/setup-view.js";
import { ActionButton } from "./action-button.js";
import { useCatalogSetup } from "./catalog-setup-context.js";

interface ActivitiesSectionProps {
  onAddActivity: (groupId: string) => void;
}

function groupCountLine({ result }: { result: ActivityGroupResult }): string {
  const archived = result.archivedCount
    ? ` · ${result.archivedCount} archived`
    : "";
  return `${result.activeCount} active${archived}${result.group.archived ? " · group archived" : ""}`;
}

/** The groups and their activities, with the filter and the form for a new group. */
export function SetupActivitiesSection({
  onAddActivity,
}: ActivitiesSectionProps) {
  const { logic, state } = useCatalogSetup();
  const view = buildSetupView({
    groups: state.groups,
    activities: state.activities,
    goals: state.goals,
    overrides: state.overrides,
    query: state.activityQuery,
  });
  const { groupedActivities } = view;
  const query = state.activityQuery.trim();
  const groupReordering = logic.isPending(reorderKey("group"));
  const activityReordering = logic.isPending(reorderKey("activity"));
  const creatingGroup = logic.isPending("create:group");
  const groupFormBusy = groupReordering || creatingGroup;
  const activeGroups = view.groups.filter((group) => !group.archived);
  const groupWord = view.activeGroupCount === 1 ? "group" : "groups";

  return (
    <section className="settings-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Activities</p>
          <h2>{`${view.activeActivityCount} active activities in ${view.activeGroupCount} ${groupWord}`}</h2>
        </div>
      </div>
      <label className="search-field">
        <MaterialIcon name="search" />
        <input
          placeholder="Filter activities to manage"
          aria-label="Filter activities to manage"
          value={state.activityQuery}
          onChange={(event) =>
            logic.setActivityQuery({ query: event.target.value })
          }
        />
      </label>
      <div className="management-groups">
        {groupedActivities.map((result, groupIndex) => {
          const { group } = result;
          const groupPending =
            logic.isPending(actionKey({ kind: "group", id: group.id })) ||
            groupReordering;
          const updating = `Updating ${group.name}…`;
          return (
            <details
              key={group.id}
              className={group.archived ? "archived" : undefined}
              data-id={group.id}
              aria-label={group.name}
              open={query !== "" || state.openGroupIds.includes(group.id)}
              onToggle={(event) =>
                logic.setGroupOpen({
                  groupId: group.id,
                  open: event.currentTarget.open,
                })
              }
            >
              <summary>
                <span className="management-copy">
                  <strong>{group.name}</strong>
                  <small>{groupCountLine({ result })}</small>
                </span>
                <span className="management-group-meta">
                  <span className="management-actions">
                    <ActionButton
                      inSummary
                      label={groupPending ? updating : `Rename ${group.name}`}
                      icon="edit"
                      busy={groupPending}
                      disabled={groupPending}
                      onClick={() =>
                        void logic.rename({
                          kind: "group",
                          id: group.id,
                          current: group.name,
                        })
                      }
                    />
                    <ActionButton
                      inSummary
                      label={
                        groupReordering ? updating : `Move ${group.name} up`
                      }
                      icon="arrow_upward"
                      busy={groupReordering}
                      disabled={groupIndex === 0 || groupPending}
                      onClick={() =>
                        void logic.move({
                          kind: "group",
                          itemId: group.id,
                          items: groupedActivities.map(
                            (visible) => visible.group,
                          ),
                          direction: -1,
                        })
                      }
                    />
                    <ActionButton
                      inSummary
                      label={
                        groupReordering ? updating : `Move ${group.name} down`
                      }
                      icon="arrow_downward"
                      busy={groupReordering}
                      disabled={
                        groupIndex === groupedActivities.length - 1 ||
                        groupPending
                      }
                      onClick={() =>
                        void logic.move({
                          kind: "group",
                          itemId: group.id,
                          items: groupedActivities.map(
                            (visible) => visible.group,
                          ),
                          direction: 1,
                        })
                      }
                    />
                    <ActionButton
                      inSummary
                      label={
                        groupPending
                          ? updating
                          : group.archived
                            ? `Restore ${group.name}`
                            : `Archive ${group.name}`
                      }
                      icon={group.archived ? "unarchive" : "archive"}
                      busy={groupPending}
                      disabled={groupPending}
                      onClick={() =>
                        void logic.archive({
                          kind: "group",
                          id: group.id,
                          archived: group.archived,
                        })
                      }
                    />
                    <ActionButton
                      inSummary
                      danger
                      label={groupPending ? updating : `Delete ${group.name}`}
                      icon="delete"
                      busy={groupPending}
                      disabled={groupPending}
                      onClick={() =>
                        void logic.remove({
                          kind: "group",
                          id: group.id,
                          name: group.name,
                        })
                      }
                    />
                  </span>
                  {!group.archived && (
                    <button
                      type="button"
                      className="add-activity-button"
                      aria-label={`Add new activity to ${group.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        onAddActivity(group.id);
                      }}
                    >
                      + Add new
                    </button>
                  )}
                </span>
                <MaterialIcon name="expand_more" />
              </summary>
              <div className="management-list">
                {result.activities.length === 0 && (
                  <p className="empty-inline">No activities in this group.</p>
                )}
                {result.activities.map((activity, index) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    index={index}
                    count={result.activities.length}
                    siblings={result.activities}
                    activeGroups={activeGroups}
                    activityReordering={activityReordering}
                  />
                ))}
              </div>
            </details>
          );
        })}
      </div>
      {query && groupedActivities.length === 0 && (
        <p className="empty-inline">No activities match that filter.</p>
      )}
      <div className="inline-form">
        <input
          placeholder="New group name"
          aria-label="New group name"
          value={state.newGroupName}
          aria-busy={groupFormBusy}
          disabled={groupFormBusy}
          onChange={(event) =>
            logic.setNewGroupName({ name: event.target.value })
          }
        />
        <button
          type="button"
          className="secondary-button"
          aria-busy={groupFormBusy}
          disabled={groupFormBusy}
          onClick={() => void logic.createGroup()}
        >
          {groupFormBusy ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <MaterialIcon name="add" />
          )}{" "}
          {creatingGroup
            ? "Adding…"
            : groupReordering
              ? "Reordering…"
              : "Add group"}
        </button>
      </div>
    </section>
  );
}

interface ActivityRowProps {
  activity: Activity;
  index: number;
  count: number;
  siblings: Activity[];
  activeGroups: Array<{ id: string; name: string }>;
  activityReordering: boolean;
}

function ActivityRow({
  activity,
  index,
  count,
  siblings,
  activeGroups,
  activityReordering,
}: ActivityRowProps) {
  const { logic } = useCatalogSetup();
  const pending =
    logic.isPending(actionKey({ kind: "activity", id: activity.id })) ||
    activityReordering;
  const updating = `Updating ${activity.name}…`;
  const move = (direction: -1 | 1) =>
    void logic.move({
      kind: "activity",
      itemId: activity.id,
      items: siblings,
      direction,
    });
  return (
    <div
      className={`management-row ${activity.archived ? "archived" : ""}`}
      data-id={activity.id}
    >
      <span className="management-icon">
        <MaterialIcon name={activity.icon} />
      </span>
      <span className="management-copy">
        <strong>{activity.name}</strong>
        <small>{`${activity.icon}${activity.archived ? " · archived" : ""}`}</small>
      </span>
      <select
        className={`tiny-select ${pending ? "pending-action" : ""}`}
        aria-label={`Move ${activity.name} to group`}
        aria-busy={pending}
        disabled={pending}
        value={activity.groupId}
        onChange={(event) =>
          void logic.moveToGroup({
            id: activity.id,
            groupId: event.target.value,
          })
        }
      >
        {activeGroups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
      <span className="management-actions">
        <ActionButton
          label={pending ? updating : `Rename ${activity.name}`}
          icon="edit"
          busy={pending}
          disabled={pending}
          onClick={() =>
            void logic.rename({
              kind: "activity",
              id: activity.id,
              current: activity.name,
            })
          }
        />
        <ActionButton
          label={pending ? updating : `Choose icon for ${activity.name}`}
          icon="palette"
          busy={pending}
          disabled={pending}
          onClick={() =>
            logic.openIconPicker({
              target: {
                id: activity.id,
                name: activity.name,
                icon: activity.icon,
              },
            })
          }
        />
        <ActionButton
          label={activityReordering ? updating : `Move ${activity.name} up`}
          icon="arrow_upward"
          busy={activityReordering}
          disabled={index === 0 || activityReordering || pending}
          onClick={() => move(-1)}
        />
        <ActionButton
          label={activityReordering ? updating : `Move ${activity.name} down`}
          icon="arrow_downward"
          busy={activityReordering}
          disabled={index === count - 1 || activityReordering || pending}
          onClick={() => move(1)}
        />
        <ActionButton
          label={
            pending
              ? updating
              : activity.archived
                ? `Restore ${activity.name}`
                : `Archive ${activity.name}`
          }
          icon={activity.archived ? "unarchive" : "archive"}
          busy={pending}
          disabled={pending}
          onClick={() =>
            void logic.archive({
              kind: "activity",
              id: activity.id,
              archived: activity.archived,
            })
          }
        />
        <ActionButton
          danger
          label={pending ? updating : `Delete ${activity.name}`}
          icon="delete"
          busy={pending}
          disabled={pending}
          onClick={() =>
            void logic.remove({
              kind: "activity",
              id: activity.id,
              name: activity.name,
            })
          }
        />
      </span>
    </div>
  );
}

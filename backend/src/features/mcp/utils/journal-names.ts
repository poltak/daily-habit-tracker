import { ALL_WEEKDAYS_MASK } from "@app/common/features/goals/utils/goal-history";
import type { Catalog, Goal, Mood } from "@app/common/features/catalog/types";
import {
  WEEKDAY_NAMES,
  dayOfWeek,
  weekStartsOn,
} from "@app/common/features/core/utils/logical-date";
import type { Entry } from "@app/common/features/days/types";
import { ToolInputError } from "./check-arguments.js";

/** The catalog with a name for each activity and goal that is unique in its list. */
export interface NamedCatalog extends Catalog {
  activityLabels: Map<string, string>;
  goalLabels: Map<string, string>;
}

const keyOf = (text: string) => text.trim().toLowerCase();

function countKeys(texts: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    counts.set(keyOf(text), (counts.get(keyOf(text)) ?? 0) + 1);
  }
  return counts;
}

/** A name for each item that is unique in its list. Names that repeat get their group, then a number. */
function uniqueLabels<Item extends { id: string; name: string }>({
  items,
  qualifier,
}: {
  items: readonly Item[];
  qualifier?: (item: Item) => string | undefined;
}): Map<string, string> {
  const nameCounts = countKeys(items.map((item) => item.name));
  const qualified = items.map((item) => {
    const extra =
      (nameCounts.get(keyOf(item.name)) ?? 0) > 1
        ? qualifier?.(item)
        : undefined;
    return extra ? `${item.name} (${extra})` : item.name;
  });
  const qualifiedCounts = countKeys(qualified);
  const seen = new Map<string, number>();
  return new Map(
    items.map((item, index) => {
      const label = qualified[index] ?? item.name;
      if (qualifiedCounts.get(keyOf(label)) === 1) {
        return [item.id, label];
      }
      const position = (seen.get(keyOf(label)) ?? 0) + 1;
      seen.set(keyOf(label), position);
      return [item.id, `${label} #${position}`];
    }),
  );
}

export function nameCatalog(catalog: Catalog): NamedCatalog {
  const groupNames = new Map(
    catalog.groups.map((group) => [group.id, group.name]),
  );
  return {
    ...catalog,
    activityLabels: uniqueLabels({
      items: catalog.activities,
      qualifier: (activity) => groupNames.get(activity.groupId),
    }),
    goalLabels: uniqueLabels({ items: catalog.goals }),
  };
}

/** Find one item by id, by its unique label, or by its name when only one item has that name. */
export function resolveReference<Item extends { id: string; name: string }>({
  value,
  items,
  labels,
  kind,
}: {
  value: string;
  items: readonly Item[];
  labels: Map<string, string>;
  kind: "activity" | "goal";
}): Item {
  const wanted = keyOf(value);
  const byId = items.find((item) => item.id === value);
  if (byId) {
    return byId;
  }
  const byLabel = items.find(
    (item) => keyOf(labels.get(item.id) ?? "") === wanted,
  );
  if (byLabel) {
    return byLabel;
  }
  const byName = items.filter((item) => keyOf(item.name) === wanted);
  const [only] = byName;
  if (only && byName.length === 1) {
    return only;
  }
  if (byName.length > 1) {
    throw new ToolInputError(
      `"${value}" matches more than one ${kind}: ${byName.map((item) => `"${labels.get(item.id)}"`).join(", ")}. Use one of these names or an id from get_overview.`,
    );
  }
  throw new ToolInputError(
    `No ${kind} is called "${value}". Call get_overview for the list of ${kind === "activity" ? "activities" : `${kind}s`}.`,
  );
}

export function resolveMood({
  value,
  moods,
}: {
  value: unknown;
  moods: readonly Mood[];
}): Mood {
  const mood =
    typeof value === "number"
      ? moods.find((candidate) => candidate.score === value)
      : moods.find(
          (candidate) =>
            candidate.id === value ||
            keyOf(candidate.name) === keyOf(String(value)),
        );
  if (!mood) {
    throw new ToolInputError(
      `Unknown mood ${JSON.stringify(value)}. Use a score from 1 to 5 or one of: ${moods.map((candidate) => candidate.name).join(", ")}.`,
    );
  }
  return mood;
}

function goalSchedule(goal: Goal): string {
  if (goal.repeatType === "weekly") {
    const target = goal.targetPerWeek ?? 1;
    return `${target} ${target === 1 ? "day" : "days"} per week`;
  }
  const mask = goal.weekdaysMask ?? ALL_WEEKDAYS_MASK;
  if (mask === ALL_WEEKDAYS_MASK) {
    return "Every day";
  }
  return WEEKDAY_NAMES.filter((_, weekday) => mask & (1 << weekday))
    .map((name) => name.slice(0, 3))
    .join(", ");
}

export function describeGoal({
  goal,
  catalog,
}: {
  goal: Goal;
  catalog: NamedCatalog;
}) {
  return {
    id: goal.id,
    name: catalog.goalLabels.get(goal.id),
    schedule: goalSchedule(goal),
    linked_activity: goal.activityId
      ? (catalog.activityLabels.get(goal.activityId) ?? null)
      : null,
    start_date: goal.startDate ?? null,
    ...(goal.archived ? { archived: true } : {}),
  };
}

function sortedLabels(labels: Map<string, string>, ids: string[]): string[] {
  return ids
    .map((id) => labels.get(id) ?? id)
    .toSorted((a, b) => a.localeCompare(b));
}

export function describeDay({
  entry,
  catalog,
}: {
  entry: Entry;
  catalog: NamedCatalog;
}) {
  const mood = catalog.moods.find((candidate) => candidate.id === entry.moodId);
  return {
    date: entry.logicalDate,
    weekday: (WEEKDAY_NAMES[dayOfWeek(entry.logicalDate)] ?? "").slice(0, 3),
    mood: mood?.name ?? entry.moodId,
    score: mood?.score ?? null,
    activities: sortedLabels(catalog.activityLabels, entry.activityIds),
    goals_completed: sortedLabels(catalog.goalLabels, entry.completedGoalIds),
  };
}

/** "Monday–Sunday" for a week that ends on Sunday. */
export function weekRangeLabel(weekEndsOn: number): string {
  return `${WEEKDAY_NAMES[weekStartsOn(weekEndsOn)]}–${WEEKDAY_NAMES[weekEndsOn]}`;
}

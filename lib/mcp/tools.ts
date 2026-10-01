// The tools the Daymark MCP server offers. Reads return compact JSON keyed by names, so an
// agent can analyse years of history without spending tokens on IDs. Writes accept either
// IDs or names.
import {
  type Activity,
  type ActivityGroup,
  type Bootstrap,
  type Entry,
  type Goal,
  type GoalHistory,
  type GoalHistoryRequest,
  type HistorySpan,
  type Mood,
  WEEKDAY_NAMES,
  addDays,
  dayOfWeek,
  goalRepeatType,
  goalWeekdayMask,
  isLogicalDate,
  logicalDateFromDate,
  startOfWeek,
  weekRangeLabel,
  weekdayOrder,
  ALL_WEEKDAYS_MASK,
} from "../daylio.ts";
import { type InsightsData, type InsightsDay, daysInInsightsRange, summarizeMood } from "../insights.ts";
import { rankActivityMoodAssociations } from "../insights-relationships.ts";

type MaybePromise<T> = T | Promise<T>;

/** The store operations the tools need. Both the D1 store and the in-memory test store provide them. */
export type JournalStore = {
  bootstrap(): MaybePromise<Bootstrap>;
  getHistorySpan(): MaybePromise<HistorySpan>;
  listEntriesInRange(startDate: string, endDate: string): MaybePromise<Entry[]>;
  getInsightsData(): MaybePromise<InsightsData>;
  getGoalHistory(request: GoalHistoryRequest): MaybePromise<GoalHistory>;
  saveDay(logicalDate: string, input: unknown): MaybePromise<Entry | null>;
};

type JsonSchema = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties: false;
};

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: boolean };
  run: (input: { store: JournalStore; args: Record<string, unknown> }) => Promise<unknown>;
};

/** The longest span of day-level rows one call returns, so a response stays a manageable size. */
export const MAX_DAY_RANGE = 366;

const DATE_PROPERTY = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const round = (value: number | null, digits = 2) => (value === null ? null : Number(value.toFixed(digits)));

// ---------- Argument checking ----------

/** Checks arguments against the tool's own input schema, so the schema and the checks cannot drift apart. */
export function checkArguments({ schema, args }: { schema: JsonSchema; args: unknown }): Record<string, unknown> {
  if (args === undefined || args === null) args = {};
  if (typeof args !== "object" || Array.isArray(args)) throw new Error("Arguments must be an object.");
  const values = args as Record<string, unknown>;
  for (const key of Object.keys(values)) {
    if (!(key in schema.properties)) throw new Error(`Unknown argument "${key}". Allowed: ${Object.keys(schema.properties).join(", ") || "none"}.`);
  }
  for (const key of schema.required ?? []) {
    if (values[key] === undefined) throw new Error(`Missing required argument "${key}".`);
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const property = schema.properties[key];
    const types = ([] as unknown[]).concat(property.type ?? []);
    const matches = types.some((type) =>
      type === "string" ? typeof value === "string"
        : type === "integer" ? typeof value === "number" && Number.isInteger(value)
          : type === "boolean" ? typeof value === "boolean"
            : type === "array" ? Array.isArray(value) && value.every((item) => typeof item === "string")
              : false);
    if (!matches) throw new Error(`Argument "${key}" must be ${types.map((type) => (type === "array" ? "an array of strings" : `a ${type}`)).join(" or ")}.`);
    if (property.pattern === DATE_PROPERTY.pattern && typeof value === "string" && !isLogicalDate(value)) throw new Error(`Argument "${key}" must be a real calendar date written YYYY-MM-DD.`);
    if (Array.isArray(property.enum) && !property.enum.includes(value)) throw new Error(`Argument "${key}" must be one of: ${property.enum.join(", ")}.`);
    if (typeof property.minimum === "number" && typeof value === "number" && value < property.minimum) throw new Error(`Argument "${key}" must be at least ${property.minimum}.`);
  }
  return values;
}

function checkDayRange({ startDate, endDate }: { startDate: string; endDate: string }) {
  if (startDate > endDate) throw new Error("start_date must not be after end_date.");
  if (daysInInsightsRange(startDate, endDate) > MAX_DAY_RANGE) throw new Error(`Ask for at most ${MAX_DAY_RANGE} days per call. Split a longer span into several calls, or use a summarize tool.`);
}

// ---------- Names ----------

/** A name for each item that is unique in its list. Names that repeat get their group, then a number. */
function uniqueLabels<T extends { id: string; name: string }>({ items, qualifier }: { items: readonly T[]; qualifier?: (item: T) => string | undefined }) {
  const key = (text: string) => text.trim().toLowerCase();
  const count = (texts: string[]) => texts.reduce((counts, text) => counts.set(key(text), (counts.get(key(text)) ?? 0) + 1), new Map<string, number>());
  const nameCounts = count(items.map((item) => item.name));
  const qualified = items.map((item) => {
    const extra = nameCounts.get(key(item.name))! > 1 ? qualifier?.(item) : undefined;
    return extra ? `${item.name} (${extra})` : item.name;
  });
  const qualifiedCounts = count(qualified);
  const seen = new Map<string, number>();
  return new Map(items.map((item, index) => {
    const label = qualified[index];
    if (qualifiedCounts.get(key(label)) === 1) return [item.id, label];
    const position = (seen.get(key(label)) ?? 0) + 1;
    seen.set(key(label), position);
    return [item.id, `${label} #${position}`];
  }));
}

type Catalog = {
  moods: Mood[];
  groups: ActivityGroup[];
  activities: Activity[];
  goals: Goal[];
  activityLabels: Map<string, string>;
  goalLabels: Map<string, string>;
};

function catalogFrom({ moods, groups, activities, goals = [] }: { moods: Mood[]; groups: ActivityGroup[]; activities: Activity[]; goals?: Goal[] }): Catalog {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  return {
    moods,
    groups,
    activities,
    goals,
    activityLabels: uniqueLabels({ items: activities, qualifier: (activity) => groupNames.get(activity.groupId) }),
    goalLabels: uniqueLabels({ items: goals }),
  };
}

/** Finds one item by ID, by its unique label, or by its name when only one item has that name. */
function resolveReference<T extends { id: string; name: string }>({ value, items, labels, kind }: { value: string; items: readonly T[]; labels: Map<string, string>; kind: string }): T {
  const wanted = value.trim().toLowerCase();
  const byId = items.find((item) => item.id === value);
  if (byId) return byId;
  const byLabel = items.find((item) => labels.get(item.id)!.toLowerCase() === wanted);
  if (byLabel) return byLabel;
  const byName = items.filter((item) => item.name.trim().toLowerCase() === wanted);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new Error(`"${value}" matches more than one ${kind}: ${byName.map((item) => `"${labels.get(item.id)}"`).join(", ")}. Use one of these names or an id from get_overview.`);
  throw new Error(`No ${kind} is called "${value}". Call get_overview for the list of ${kind === "activity" ? "activities" : `${kind}s`}.`);
}

function resolveMood({ value, moods }: { value: unknown; moods: Mood[] }): Mood {
  const mood = typeof value === "number"
    ? moods.find((candidate) => candidate.score === value)
    : moods.find((candidate) => candidate.id === value || candidate.name.toLowerCase() === String(value).trim().toLowerCase());
  if (!mood) throw new Error(`Unknown mood ${JSON.stringify(value)}. Use a score from 1 to 5 or one of: ${moods.map((candidate) => candidate.name).join(", ")}.`);
  return mood;
}

function goalSchedule(goal: Goal) {
  if (goalRepeatType(goal) === "weekly") {
    const target = goal.targetPerWeek ?? 1;
    return `${target} ${target === 1 ? "day" : "days"} per week`;
  }
  const mask = goalWeekdayMask(goal);
  if (mask === ALL_WEEKDAYS_MASK) return "Every day";
  return WEEKDAY_NAMES.filter((_, weekday) => mask & (1 << weekday)).map((name) => name.slice(0, 3)).join(", ");
}

function describeGoal({ goal, catalog }: { goal: Goal; catalog: Catalog }) {
  return {
    id: goal.id,
    name: catalog.goalLabels.get(goal.id),
    schedule: goalSchedule(goal),
    linked_activity: goal.activityId ? catalog.activityLabels.get(goal.activityId) ?? null : null,
    start_date: goal.startDate ?? null,
    ...(goal.archived ? { archived: true } : {}),
  };
}

function describeDay({ entry, catalog }: { entry: Entry; catalog: Catalog }) {
  const mood = catalog.moods.find((candidate) => candidate.id === entry.moodId);
  return {
    date: entry.logicalDate,
    weekday: WEEKDAY_NAMES[dayOfWeek(entry.logicalDate)].slice(0, 3),
    mood: mood?.name ?? entry.moodId,
    score: mood?.score ?? null,
    activities: entry.activityIds.map((id) => catalog.activityLabels.get(id) ?? id).sort((a, b) => a.localeCompare(b)),
    goals_completed: entry.completedGoalIds.map((id) => catalog.goalLabels.get(id) ?? id).sort((a, b) => a.localeCompare(b)),
  };
}

// ---------- Mood summaries ----------

function describeMoodSummary({ days, moods }: { days: readonly InsightsDay[]; moods: Mood[] }) {
  const summary = summarizeMood(days, moods);
  const names = new Map(moods.map((mood) => [mood.id, mood.name]));
  return {
    recorded_days: summary.count,
    mean_mood: round(summary.mean),
    good_share: round(summary.goodRate),
    distribution: Object.fromEntries(summary.distribution.map(({ moodId, count }) => [names.get(moodId) ?? moodId, count])),
  };
}

/** Days inside the requested range. A missing bound falls back to the first or last recorded day. */
function daysInRange({ days, args }: { days: readonly InsightsDay[]; args: Record<string, unknown> }) {
  const startDate = (args.start_date as string | undefined) ?? days[0]?.logicalDate ?? logicalDateFromDate();
  const endDate = (args.end_date as string | undefined) ?? days[days.length - 1]?.logicalDate ?? startDate;
  if (startDate > endDate) throw new Error("start_date must not be after end_date.");
  return { startDate, endDate, days: days.filter((day) => day.logicalDate >= startDate && day.logicalDate <= endDate) };
}

// ---------- Tools ----------

const RANGE_PROPERTIES = {
  start_date: { ...DATE_PROPERTY, description: "First day to include, YYYY-MM-DD. Defaults to the first recorded day." },
  end_date: { ...DATE_PROPERTY, description: "Last day to include, YYYY-MM-DD. Defaults to the last recorded day." },
};

export const MCP_TOOLS: McpTool[] = [
  {
    name: "get_overview",
    title: "Journal overview",
    description: "Start here. Returns the vocabulary of the journal and how much history it holds: the five moods with their scores (5 is best, 1 is worst), every activity by group, the goals with their schedules, the day a week ends on, and the first day, last day and number of recorded days.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run({ store }) {
      const [data, span] = await Promise.all([store.bootstrap(), store.getHistorySpan()]);
      const catalog = catalogFrom(data);
      return {
        history: { first_day: span.firstDate, last_day: span.lastDate, recorded_days: span.recordedDays },
        week: weekRangeLabel(data.settings.weekEndsOn),
        moods: data.moods.map((mood) => ({ id: mood.id, name: mood.name, score: mood.score })),
        activity_groups: data.groups.map((group) => ({
          group: group.name,
          ...(group.archived ? { archived: true } : {}),
          activities: data.activities.filter((activity) => activity.groupId === group.id).map((activity) => ({
            id: activity.id,
            name: catalog.activityLabels.get(activity.id),
            ...(activity.archived ? { archived: true } : {}),
          })),
        })),
        goals: data.goals.map((goal) => describeGoal({ goal, catalog })),
      };
    },
  },
  {
    name: "get_days",
    title: "Day-by-day entries",
    description: `Returns each recorded day in a date range, oldest first: the date, weekday, mood name and score, the activities done, and the goals completed. Days with no saved entry are left out. One call covers at most ${MAX_DAY_RANGE} days. For longer periods, call it once per year or use summarize_mood and summarize_activities, which cover any span in one call.`,
    inputSchema: {
      type: "object",
      properties: {
        start_date: { ...DATE_PROPERTY, description: "First day to include, YYYY-MM-DD." },
        end_date: { ...DATE_PROPERTY, description: "Last day to include, YYYY-MM-DD." },
      },
      required: ["start_date", "end_date"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run({ store, args }) {
      const startDate = args.start_date as string;
      const endDate = args.end_date as string;
      checkDayRange({ startDate, endDate });
      const [data, entries] = await Promise.all([store.bootstrap(), store.listEntriesInRange(startDate, endDate)]);
      const catalog = catalogFrom(data);
      return {
        start_date: startDate,
        end_date: endDate,
        days_in_range: daysInInsightsRange(startDate, endDate),
        recorded_days: entries.length,
        days: entries.map((entry) => describeDay({ entry, catalog })),
      };
    },
  },
  {
    name: "summarize_mood",
    title: "Mood summary by period",
    description: "Summarizes mood over any span in one call. Returns the number of recorded days, the mean mood score (1 to 5), the share of days scored 4 or 5, and how many days had each mood, for the whole range and for each period. Group by month, year, week or weekday to see trends and rhythms. Days without an entry are not counted.",
    inputSchema: {
      type: "object",
      properties: {
        ...RANGE_PROPERTIES,
        group_by: { type: "string", enum: ["month", "year", "week", "weekday", "none"], description: "How to split the range into periods. Defaults to month. Weeks are labelled by their first day and follow the journal's week setting." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run({ store, args }) {
      const groupBy = (args.group_by as string | undefined) ?? "month";
      const needsWeek = groupBy === "week" || groupBy === "weekday";
      const [insights, data] = await Promise.all([store.getInsightsData(), needsWeek ? store.bootstrap() : null]);
      const { startDate, endDate, days } = daysInRange({ days: insights.days, args });
      const weekEndsOn = data?.settings.weekEndsOn ?? 0;
      const periodOf = (day: InsightsDay) =>
        groupBy === "year" ? day.logicalDate.slice(0, 4)
          : groupBy === "week" ? startOfWeek(day.logicalDate, weekEndsOn)
            : groupBy === "weekday" ? WEEKDAY_NAMES[dayOfWeek(day.logicalDate)]
              : day.logicalDate.slice(0, 7);
      const buckets = new Map<string, InsightsDay[]>();
      if (groupBy !== "none") {
        for (const day of days) buckets.set(periodOf(day), [...(buckets.get(periodOf(day)) ?? []), day]);
      }
      const weekdayNames = weekdayOrder(weekEndsOn).map((weekday) => WEEKDAY_NAMES[weekday]);
      const order = groupBy === "weekday" ? weekdayNames.filter((name) => buckets.has(name)) : [...buckets.keys()].sort();
      return {
        start_date: startDate,
        end_date: endDate,
        ...describeMoodSummary({ days, moods: insights.moods }),
        group_by: groupBy,
        periods: order.map((period) => ({
          period,
          ...(groupBy === "week" ? { week_end: addDays(period, 6) } : {}),
          ...describeMoodSummary({ days: buckets.get(period)!, moods: insights.moods }),
        })),
      };
    },
  },
  {
    name: "summarize_activities",
    title: "Activity frequency and mood association",
    description: "For every activity, over any span in one call: how many days it was recorded, its share of recorded days, the mean mood on days with it and on days without it, and the difference. Rows are ranked by that difference, largest first. The difference describes an association in the recorded days and does not show that the activity caused the mood. Rows marked small_sample have fewer than 10 days on one side and are weak evidence.",
    inputSchema: {
      type: "object",
      properties: {
        ...RANGE_PROPERTIES,
        min_days: { type: "integer", minimum: 1, description: "Leave out activities recorded on fewer days than this. Defaults to 1." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run({ store, args }) {
      const insights = await store.getInsightsData();
      const catalog = catalogFrom(insights);
      const groupNames = new Map(insights.groups.map((group) => [group.id, group.name]));
      const groupOf = new Map(insights.activities.map((activity) => [activity.id, groupNames.get(activity.groupId) ?? null]));
      const { startDate, endDate, days } = daysInRange({ days: insights.days, args });
      const minDays = (args.min_days as number | undefined) ?? 1;
      const overall = summarizeMood(days, insights.moods);
      return {
        start_date: startDate,
        end_date: endDate,
        recorded_days: overall.count,
        mean_mood: round(overall.mean),
        activities: rankActivityMoodAssociations({ days, moods: insights.moods, activities: insights.activities })
          .filter((association) => association.recorded.sampleSize >= minDays)
          .map((association) => ({
            activity: catalog.activityLabels.get(association.activityId),
            group: groupOf.get(association.activityId),
            days: association.recorded.sampleSize,
            share_of_days: round(overall.count ? association.recorded.sampleSize / overall.count : null),
            mean_mood_with: round(association.recorded.mean),
            mean_mood_without: round(association.notRecorded.mean),
            difference: round(association.meanDifference),
            ...(association.sparse ? { small_sample: true } : {}),
          })),
      };
    },
  },
  {
    name: "get_goal_history",
    title: "Goal completions and weekly results",
    description: `Returns one goal's history in a date range of at most ${MAX_DAY_RANGE} days: the dates it was completed and a result for each week (accomplished, not_accomplished, in_progress or upcoming) with completed and expected day counts. Weeks before the goal's start date are left out.`,
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The goal's name or id, from get_overview." },
        start_date: { ...DATE_PROPERTY, description: "First day to include, YYYY-MM-DD." },
        end_date: { ...DATE_PROPERTY, description: "Last day to include, YYYY-MM-DD." },
        today: { ...DATE_PROPERTY, description: "Today's date where the journal owner lives, YYYY-MM-DD. It decides which week is in progress. Defaults to the server's date, which is in UTC." },
      },
      required: ["goal", "start_date", "end_date"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run({ store, args }) {
      const startDate = args.start_date as string;
      const endDate = args.end_date as string;
      checkDayRange({ startDate, endDate });
      const catalog = catalogFrom(await store.bootstrap());
      const goal = resolveReference({ value: args.goal as string, items: catalog.goals, labels: catalog.goalLabels, kind: "goal" });
      const today = (args.today as string | undefined) ?? logicalDateFromDate();
      const history = await store.getGoalHistory({ goalId: goal.id, startDate, endDate, asOf: today });
      const results = { accomplished: 0, not_accomplished: 0, in_progress: 0, upcoming: 0 };
      for (const week of history.weeks) results[week.status] += 1;
      return {
        goal: describeGoal({ goal, catalog }),
        start_date: startDate,
        end_date: endDate,
        today,
        completed_dates: history.days.filter((day) => day.completed).map((day) => day.logicalDate),
        week_results: results,
        weeks: history.weeks.map((week) => ({
          week_start: week.weekStart,
          week_end: week.weekEnd,
          status: week.status,
          completed_days: week.completedCount,
          expected_days: week.expectedCount,
        })),
      };
    },
  },
  {
    name: "save_day",
    title: "Add or replace a day's entry",
    description: "Saves the entry for one day: its mood and the full list of activities done. The journal holds one entry per day, so this fails if the day already has an entry unless replace_existing is true, and replacing overwrites that day's mood, activities and goal completions. Goals linked to an activity are completed automatically when that activity is listed, and completing a linked goal adds its activity. Activities, goals and moods can be given by name or by id from get_overview.",
    inputSchema: {
      type: "object",
      properties: {
        date: { ...DATE_PROPERTY, description: "The day the entry describes, YYYY-MM-DD, in the journal owner's local time." },
        mood: { type: ["string", "integer"], description: "A mood name such as \"Good\", a mood id, or a score from 1 (worst) to 5 (best)." },
        activities: { type: "array", items: { type: "string" }, description: "Every activity done that day, by name or id. Pass an empty list for none." },
        completed_goals: { type: "array", items: { type: "string" }, description: "Goals to mark completed that day, by name or id. Only needed for goals with no linked activity. When given, unlinked goals not listed are marked not completed. When omitted, they are left as they are." },
        replace_existing: { type: "boolean", description: "Set true to overwrite an entry that already exists for this day. Defaults to false." },
      },
      required: ["date", "mood", "activities"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async run({ store, args }) {
      const date = args.date as string;
      const replace = args.replace_existing === true;
      const catalog = catalogFrom(await store.bootstrap());
      const mood = resolveMood({ value: args.mood, moods: catalog.moods });
      const activityIds = (args.activities as string[]).map((value) => resolveReference({ value, items: catalog.activities, labels: catalog.activityLabels, kind: "activity" }).id);
      const completedGoalIds = (args.completed_goals as string[] | undefined)?.map((value) => resolveReference({ value, items: catalog.goals, labels: catalog.goalLabels, kind: "goal" }).id);
      let entry: Entry | null;
      try {
        entry = await store.saveDay(date, {
          moodId: mood.id,
          activityIds,
          ...(completedGoalIds ? { completedGoalIds } : {}),
          ...(replace ? {} : { expectedVersion: 0 }),
        });
      } catch (error) {
        if (!replace && (error as { code?: string }).code === "VERSION_CONFLICT") throw new Error(`${date} already has a saved entry. Read it with get_days, then pass replace_existing: true if it should be overwritten.`);
        throw error;
      }
      if (!entry) throw new Error("The entry could not be read back after saving.");
      return { saved: !replace || entry.version === 1 ? "created" : "replaced", day: describeDay({ entry, catalog }) };
    },
  },
];

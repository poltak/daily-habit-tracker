import { ToolInputError, checkArguments } from "../utils/check-arguments.js";
import {
  describeDay,
  describeGoal,
  nameCatalog,
  resolveMood,
  resolveReference,
  weekRangeLabel,
  type NamedCatalog,
} from "../utils/journal-names.js";
import { MAX_DAY_RANGE, TOOL_DEFINITIONS } from "../utils/tool-definitions.js";
import { AppError } from "../../core/errors/app-error.js";
import type { BackendLogic, BackendServices } from "../../core/types.js";
import type { Mood } from "@app/common/features/catalog/types";
import { buildGoalHistory } from "@app/common/features/goals/utils/goal-history";
import type { EffectiveDay } from "@app/common/features/days/types";
import { rankActivityMoodAssociations } from "@app/common/features/insights/utils/activity-associations";
import { daysInInsightsRange } from "@app/common/features/insights/utils/date-range";
import { summarizeMood } from "@app/common/features/insights/utils/summarize-mood";
import {
  WEEKDAY_NAMES,
  addDays,
  dayOfWeek,
  weekStartsOn,
  weekdayOrder,
} from "@app/common/features/core/utils/logical-date";
import type { CallTool } from "./mcp-protocol.js";

type ToolLogic = Pick<BackendLogic, "catalog" | "days" | "settings">;

type Args = Record<string, unknown>;

function round(value: number | null, digits = 2): number | null {
  return value === null ? null : Number(value.toFixed(digits));
}

/** The first day of the week that holds `logicalDate`. */
function startOfWeek({
  logicalDate,
  weekEndsOn,
}: {
  logicalDate: string;
  weekEndsOn: number;
}): string {
  return addDays(
    logicalDate,
    -((dayOfWeek(logicalDate) - weekStartsOn(weekEndsOn) + 7) % 7),
  );
}

function checkDayRange({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  if (startDate > endDate) {
    throw new ToolInputError("start_date must not be after end_date.");
  }
  if (daysInInsightsRange(startDate, endDate) > MAX_DAY_RANGE) {
    throw new ToolInputError(
      `Ask for at most ${MAX_DAY_RANGE} days per call. Split a longer span into several calls, or use a summarize tool.`,
    );
  }
}

function describeMoodSummary({
  days,
  moods,
}: {
  days: readonly EffectiveDay[];
  moods: readonly Mood[];
}) {
  const summary = summarizeMood(days, moods);
  const names = new Map(moods.map((mood) => [mood.id, mood.name]));
  return {
    recorded_days: summary.count,
    mean_mood: round(summary.mean),
    good_share: round(summary.goodRate),
    distribution: Object.fromEntries(
      summary.distribution.map(({ moodId, count }) => [
        names.get(moodId) ?? moodId,
        count,
      ]),
    ),
  };
}

/** The days inside the requested range. A missing bound is the first or the last recorded day. */
function daysInRange({
  days,
  args,
  today,
}: {
  days: readonly EffectiveDay[];
  args: Args;
  today: string;
}) {
  const startDate =
    (args["start_date"] as string | undefined) ?? days[0]?.logicalDate ?? today;
  const endDate =
    (args["end_date"] as string | undefined) ??
    days.at(-1)?.logicalDate ??
    startDate;
  if (startDate > endDate) {
    throw new ToolInputError("start_date must not be after end_date.");
  }
  return {
    startDate,
    endDate,
    days: days.filter(
      (day) => day.logicalDate >= startDate && day.logicalDate <= endDate,
    ),
  };
}

/**
 * Every tool of the server. The tools read the days, the catalog and the
 * settings through their Logic classes, and a tool that fails reports it in
 * its result, so that the agent can read the message and try again.
 */
export function createToolCaller({
  logic,
  services,
}: {
  logic: ToolLogic;
  services: Pick<BackendServices, "logger">;
}): CallTool {
  const tools: Record<string, (args: Args) => Promise<unknown>> = {
    async get_overview() {
      const [catalog, span, weekEndsOn] = await Promise.all([
        logic.catalog.read(),
        logic.days.historySpan(),
        logic.settings.readWeekEndsOn(),
      ]);
      const named = nameCatalog(catalog);
      return {
        history: {
          first_day: span.firstDate,
          last_day: span.lastDate,
          recorded_days: span.recordedDays,
        },
        week: weekRangeLabel(weekEndsOn),
        moods: catalog.moods.map((mood) => ({
          id: mood.id,
          name: mood.name,
          score: mood.score,
        })),
        activity_groups: catalog.groups.map((group) => ({
          group: group.name,
          ...(group.archived ? { archived: true } : {}),
          activities: catalog.activities
            .filter((activity) => activity.groupId === group.id)
            .map((activity) => ({
              id: activity.id,
              name: named.activityLabels.get(activity.id),
              ...(activity.archived ? { archived: true } : {}),
            })),
        })),
        goals: catalog.goals.map((goal) =>
          describeGoal({ goal, catalog: named }),
        ),
      };
    },

    async get_days(args) {
      const startDate = args["start_date"] as string;
      const endDate = args["end_date"] as string;
      checkDayRange({ startDate, endDate });
      const [catalog, entries] = await Promise.all([
        logic.catalog.read(),
        logic.days.listEntriesInRange({ startDate, endDate }),
      ]);
      const named = nameCatalog(catalog);
      return {
        start_date: startDate,
        end_date: endDate,
        days_in_range: daysInInsightsRange(startDate, endDate),
        recorded_days: entries.length,
        days: entries.map((entry) => describeDay({ entry, catalog: named })),
      };
    },

    async summarize_mood(args) {
      const groupBy = (args["group_by"] as string | undefined) ?? "month";
      const [catalog, every, weekEndsOn] = await Promise.all([
        logic.catalog.read(),
        logic.days.listEffectiveDays({}),
        logic.settings.readWeekEndsOn(),
      ]);
      const { startDate, endDate, days } = daysInRange({
        days: every,
        args,
        today: logic.days.today(),
      });
      const periodOf = (day: EffectiveDay) => {
        switch (groupBy) {
          case "year":
            return day.logicalDate.slice(0, 4);
          case "week":
            return startOfWeek({ logicalDate: day.logicalDate, weekEndsOn });
          case "weekday":
            return WEEKDAY_NAMES[dayOfWeek(day.logicalDate)] ?? "";
          default:
            return day.logicalDate.slice(0, 7);
        }
      };
      const buckets = new Map<string, EffectiveDay[]>();
      if (groupBy !== "none") {
        for (const day of days) {
          buckets.set(periodOf(day), [
            ...(buckets.get(periodOf(day)) ?? []),
            day,
          ]);
        }
      }
      const order =
        groupBy === "weekday"
          ? weekdayOrder(weekEndsOn)
              .map((weekday) => WEEKDAY_NAMES[weekday] ?? "")
              .filter((name) => buckets.has(name))
          : [...buckets.keys()].toSorted();
      return {
        start_date: startDate,
        end_date: endDate,
        ...describeMoodSummary({ days, moods: catalog.moods }),
        group_by: groupBy,
        periods: order.map((period) => ({
          period,
          ...(groupBy === "week" ? { week_end: addDays(period, 6) } : {}),
          ...describeMoodSummary({
            days: buckets.get(period) ?? [],
            moods: catalog.moods,
          }),
        })),
      };
    },

    async summarize_activities(args) {
      const [catalog, every] = await Promise.all([
        logic.catalog.read(),
        logic.days.listEffectiveDays({}),
      ]);
      const named = nameCatalog(catalog);
      const groupNames = new Map(
        catalog.groups.map((group) => [group.id, group.name]),
      );
      const groupOf = new Map(
        catalog.activities.map((activity) => [
          activity.id,
          groupNames.get(activity.groupId) ?? null,
        ]),
      );
      const { startDate, endDate, days } = daysInRange({
        days: every,
        args,
        today: logic.days.today(),
      });
      const minDays = (args["min_days"] as number | undefined) ?? 1;
      const overall = summarizeMood(days, catalog.moods);
      return {
        start_date: startDate,
        end_date: endDate,
        recorded_days: overall.count,
        mean_mood: round(overall.mean),
        activities: rankActivityMoodAssociations({
          days,
          moods: catalog.moods,
          activities: catalog.activities,
        })
          .filter((association) => association.recorded.sampleSize >= minDays)
          .map((association) => ({
            activity: named.activityLabels.get(association.activityId),
            group: groupOf.get(association.activityId),
            days: association.recorded.sampleSize,
            share_of_days: round(
              overall.count
                ? association.recorded.sampleSize / overall.count
                : null,
            ),
            mean_mood_with: round(association.recorded.mean),
            mean_mood_without: round(association.notRecorded.mean),
            difference: round(association.meanDifference),
            ...(association.sparse ? { small_sample: true } : {}),
          })),
      };
    },

    async get_goal_history(args) {
      const startDate = args["start_date"] as string;
      const endDate = args["end_date"] as string;
      checkDayRange({ startDate, endDate });
      const named = nameCatalog(await logic.catalog.read());
      const goal = resolveReference({
        value: args["goal"] as string,
        items: named.goals,
        labels: named.goalLabels,
        kind: "goal",
      });
      const today = (args["today"] as string | undefined) ?? logic.days.today();
      const [dates, firstCompletedDate, weekEndsOn] = await Promise.all([
        // A week can reach six days outside the range on either side.
        logic.days.listCompletionDates({
          goalId: goal.id,
          startDate: addDays(startDate, -7),
          endDate: addDays(endDate, 7),
        }),
        logic.days.findFirstCompletionDate({ goalId: goal.id }),
        logic.settings.readWeekEndsOn(),
      ]);
      const { weeks, days } = buildGoalHistory({
        goal,
        startDate,
        endDate,
        completedDates: dates,
        firstCompletedDate,
        weekEndsOn,
        asOf: today,
      });
      const results = {
        accomplished: 0,
        not_accomplished: 0,
        in_progress: 0,
        upcoming: 0,
      };
      for (const week of weeks) {
        results[week.status] += 1;
      }
      return {
        goal: describeGoal({ goal, catalog: named }),
        start_date: startDate,
        end_date: endDate,
        today,
        completed_dates: days
          .filter((day) => day.completed)
          .map((day) => day.logicalDate),
        week_results: results,
        weeks: weeks.map((week) => ({
          week_start: week.weekStart,
          week_end: week.weekEnd,
          status: week.status,
          completed_days: week.completedCount,
          expected_days: week.expectedCount,
        })),
      };
    },

    async save_day(args) {
      const date = args["date"] as string;
      const replace = args["replace_existing"] === true;
      const named: NamedCatalog = nameCatalog(await logic.catalog.read());
      const mood = resolveMood({ value: args["mood"], moods: named.moods });
      const activityIds = (args["activities"] as string[]).map(
        (value) =>
          resolveReference({
            value,
            items: named.activities,
            labels: named.activityLabels,
            kind: "activity",
          }).id,
      );
      const completedGoalIds = (
        args["completed_goals"] as string[] | undefined
      )?.map(
        (value) =>
          resolveReference({
            value,
            items: named.goals,
            labels: named.goalLabels,
            kind: "goal",
          }).id,
      );
      let entry;
      try {
        entry = await logic.days.saveDay({
          logicalDate: date,
          input: {
            moodId: mood.id,
            activityIds,
            ...(completedGoalIds ? { completedGoalIds } : {}),
            ...(replace ? {} : { expectedVersion: 0 }),
          },
        });
      } catch (error) {
        if (
          !replace &&
          error instanceof AppError &&
          error.code === "CONFLICT"
        ) {
          throw new ToolInputError(
            `${date} already has a saved entry. Read it with get_days, then pass replace_existing: true if it should be overwritten.`,
          );
        }
        throw error;
      }
      return {
        saved: !replace || entry.version === 1 ? "created" : "replaced",
        day: describeDay({ entry, catalog: named }),
      };
    },
  };

  return async ({ name, arguments: args }) => {
    const definition = TOOL_DEFINITIONS.find((tool) => tool.name === name);
    const run =
      definition && Object.hasOwn(tools, name) ? tools[name] : undefined;
    if (!definition || !run) {
      return null;
    }
    try {
      const checked = checkArguments({ schema: definition.inputSchema, args });
      return {
        content: [{ type: "text", text: JSON.stringify(await run(checked)) }],
      };
    } catch (error) {
      if (error instanceof ToolInputError || error instanceof AppError) {
        return {
          content: [{ type: "text", text: error.message }],
          isError: true,
        };
      }
      services.logger.error("An MCP tool failed", { tool: name, error });
      return {
        content: [{ type: "text", text: "The tool failed." }],
        isError: true,
      };
    }
  };
}

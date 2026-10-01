import { isActivityIcon } from "./icons.ts";
import { isValidTime } from "./entry-validation.ts";

export type Mood = {
  id: string;
  name: string;
  score: number;
  emoji: string;
  color: string;
};

export type ActivityGroup = {
  id: string;
  name: string;
  sortOrder: number;
  archived: boolean;
};

export type Activity = {
  id: string;
  groupId: string;
  name: string;
  icon: string;
  sourceIconId?: string;
  sortOrder: number;
  archived: boolean;
};

export type Goal = {
  id: string;
  activityId: string | null;
  name: string;
  materialIcon: string;
  repeatType: GoalRepeatType;
  scheduleType: "daily" | "weekdays" | "times_per_week";
  targetPerWeek?: number | null;
  weekdaysMask?: number | null;
  startDate?: string;
  endDate?: string;
  sortOrder: number;
  archived: boolean;
  reminderEnabled: boolean;
  reminderTime?: string;
  sourceState?: number;
};

export type GoalRepeatType = "daily" | "weekly";

export type GoalHistoryDay = {
  logicalDate: string;
  completed: boolean;
  scheduled: boolean;
};

export type GoalHistoryWeek = {
  weekStart: string;
  weekEnd: string;
  completedCount: number;
  expectedCount: number;
  repeatType: GoalRepeatType;
  status: "accomplished" | "not_accomplished" | "in_progress" | "upcoming";
  accomplished: boolean | null;
};

export type GoalHistory = {
  goal: Goal;
  month: string;
  startDate: string;
  endDate: string;
  asOf: string;
  days: GoalHistoryDay[];
  weeks: GoalHistoryWeek[];
};

export type GoalHistoryRequest = {
  goalId: string;
  startDate: string;
  endDate: string;
  asOf: string;
};

export type Entry = {
  id: string;
  logicalDate: string;
  localTime: string;
  timezone: string;
  timezoneOffsetMinutes?: number;
  moodId: string;
  activityIds: string[];
  completedGoalIds: string[];
  legacyNoteTitle?: string;
  legacyNote?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type GoalCompletion = {
  goalId: string;
  logicalDate: string;
  completed: boolean;
  entryId?: string;
};

export type SelectionMutationResult = {
  completion?: GoalCompletion;
  selection?: DayActivitySelection;
  affectedGoalCompletions: GoalCompletion[];
  affectedActivitySelections: DayActivitySelection[];
};

export type DayMoodSelection = {
  logicalDate: string;
  moodId: string;
};

export type DayActivitySelection = {
  logicalDate: string;
  activityId: string;
  selected: boolean;
};

export type DaySelections = {
  logicalDate: string;
  moodId: string | null;
  activityIds: string[];
  moodOverride: boolean;
  activityOverrideIds: string[];
};

export type CalendarEntryDay = {
  logicalDate: string;
  moodId: string;
};

export type EntryInput = {
  moodId: string;
  activityIds: string[];
  completedGoalIds: string[];
  localTime?: string;
  timezone?: string;
  timezoneOffsetMinutes?: number;
  expectedVersion?: number;
  legacyNoteTitle?: string;
  legacyNote?: string;
};

export type AppSettings = {
  /** JavaScript weekday (0 = Sunday) on which a week ends. Goal weeks and insight weeks both use it. */
  weekEndsOn: number;
};

export type Bootstrap = {
  moods: Mood[];
  groups: ActivityGroup[];
  activities: Activity[];
  goals: Goal[];
  settings: AppSettings;
  today: string;
  yesterday: string;
};

export type ImportPayload = {
  sourceSystem: "daylio";
  sourceSha256?: string;
  csvSha256?: string;
  goalStateSummary?: Array<{ sourceId: string; name: string; rawState: number; completionCount: number; firstCompletion?: string | null; lastCompletion?: string | null }>;
  moods: Array<{ sourceId: string; name: string; score: number; emoji?: string }>;
  groups: Array<{ sourceId: string; name: string; sortOrder: number; archived?: boolean }>;
  activities: Array<{
    sourceId: string;
    groupSourceId?: string;
    name: string;
    sourceIconId?: string;
    sourceState?: number;
    sortOrder: number;
    archived?: boolean;
  }>;
  entries: Array<{
    sourceId: string;
    logicalDate: string;
    localTime: string;
    timezoneOffsetMinutes?: number;
    moodSourceId: string;
    activitySourceIds: string[];
    legacyNoteTitle?: string;
    legacyNote?: string;
  }>;
  goals: Array<{
    sourceId: string;
    activitySourceId?: string | null;
    name: string;
    materialIcon?: string;
    repeatType?: GoalRepeatType;
    scheduleType: Goal["scheduleType"];
    targetPerWeek?: number;
    weekdaysMask?: number;
    sortOrder: number;
    archived?: boolean;
    reminderEnabled?: boolean;
    reminderTime?: string;
    sourceState?: number;
  }>;
  completions: Array<{ sourceId: string; goalSourceId: string; logicalDate: string; localTime?: string }>;
};

export const ALL_WEEKDAYS_MASK = 0b1111111;

export const MOODS: Mood[] = [
  { id: "mood-rad", name: "Rad", score: 5, emoji: "😄", color: "#ee8f6d" },
  { id: "mood-good", name: "Good", score: 4, emoji: "🙂", color: "#f4b85f" },
  { id: "mood-meh", name: "Meh", score: 3, emoji: "😐", color: "#9aa4ae" },
  { id: "mood-bad", name: "Bad", score: 2, emoji: "☹️", color: "#809bc5" },
  { id: "mood-awful", name: "Awful", score: 1, emoji: "😫", color: "#9b82b6" },
];

export function logicalDateFromDate(value = new Date()) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(logicalDate: string, amount: number) {
  const [year, month, day] = logicalDate.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + amount);
  return logicalDateFromDate(value);
}

export function isLogicalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.valueOf()) && logicalDateFromDate(parsed) === value;
}

export function isGoalIcon(value: unknown): value is string {
  return isActivityIcon(value);
}

export function goalRepeatType(goal: Pick<Goal, "repeatType" | "scheduleType"> | { repeatType?: GoalRepeatType; scheduleType?: Goal["scheduleType"] }): GoalRepeatType {
  if (goal.repeatType === "weekly" || goal.repeatType === "daily") return goal.repeatType;
  return goal.scheduleType === "times_per_week" ? "weekly" : "daily";
}

export function normalizeGoalConfig(input: {
  repeatType?: GoalRepeatType;
  scheduleType?: Goal["scheduleType"];
  targetPerWeek?: number | null;
  weekdaysMask?: number | null;
}) {
  if (input.scheduleType !== undefined && !["daily", "weekdays", "times_per_week"].includes(input.scheduleType)) throw new Error("Choose Daily or Weekly for goal repeat.");
  if (input.repeatType !== undefined && input.repeatType !== "daily" && input.repeatType !== "weekly") throw new Error("Choose Daily or Weekly for goal repeat.");
  if (input.targetPerWeek !== undefined && input.targetPerWeek !== null && typeof input.targetPerWeek !== "number") throw new Error("Weekly goal target must be a number.");
  if (input.weekdaysMask !== undefined && input.weekdaysMask !== null && typeof input.weekdaysMask !== "number") throw new Error("Daily goal weekdays must be a number.");
  const repeatType = input.repeatType ?? (input.scheduleType === "times_per_week" ? "weekly" : "daily");
  if (repeatType === "weekly") {
    const targetPerWeek = input.targetPerWeek ?? 1;
    if (!Number.isInteger(targetPerWeek) || targetPerWeek < 1 || targetPerWeek > 7) throw new Error("Weekly goals must target between 1 and 7 days.");
    return { repeatType, scheduleType: "times_per_week" as const, targetPerWeek, weekdaysMask: null };
  }
  const rawMask = input.weekdaysMask ?? ALL_WEEKDAYS_MASK;
  const weekdaysMask = rawMask;
  if (!Number.isInteger(weekdaysMask) || weekdaysMask < 1 || weekdaysMask > ALL_WEEKDAYS_MASK) throw new Error("Daily goals must include at least one weekday.");
  return { repeatType: "daily" as const, scheduleType: weekdaysMask === ALL_WEEKDAYS_MASK ? "daily" as const : "weekdays" as const, targetPerWeek: null, weekdaysMask };
}

export function goalWeekdayMask(goal: Pick<Goal, "repeatType" | "scheduleType" | "weekdaysMask">) {
  if (goalRepeatType(goal) === "weekly") return ALL_WEEKDAYS_MASK;
  const mask = goal.weekdaysMask ?? ALL_WEEKDAYS_MASK;
  return Number.isInteger(mask) && mask > 0 ? mask & ALL_WEEKDAYS_MASK : ALL_WEEKDAYS_MASK;
}

export function dayOfWeek(logicalDate: string) {
  const [year, month, day] = logicalDate.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DEFAULT_WEEK_ENDS_ON = 0;
export const DEFAULT_SETTINGS: AppSettings = { weekEndsOn: DEFAULT_WEEK_ENDS_ON };

export function isWeekday(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

export function validateSettingsPatch(patch: unknown): Partial<AppSettings> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Settings changes must be an object.");
  for (const key of Object.keys(patch)) {
    if (key !== "weekEndsOn") throw new Error(`Unsupported setting: ${key}.`);
  }
  const { weekEndsOn } = patch as { weekEndsOn?: unknown };
  if (weekEndsOn !== undefined && !isWeekday(weekEndsOn)) throw new Error("Choose a weekday for the end of the week.");
  return weekEndsOn === undefined ? {} : { weekEndsOn };
}

export function weekStartsOn(weekEndsOn: number) {
  return (weekEndsOn + 1) % 7;
}

/** Weekday indexes in display order for a week that ends on `weekEndsOn`. */
export function weekdayOrder(weekEndsOn: number) {
  return Array.from({ length: 7 }, (_, index) => (weekStartsOn(weekEndsOn) + index) % 7);
}

/** "Monday–Sunday" for a week that ends on Sunday. */
export function weekRangeLabel(weekEndsOn: number) {
  return `${WEEKDAY_NAMES[weekStartsOn(weekEndsOn)]}–${WEEKDAY_NAMES[weekEndsOn]}`;
}

export function startOfWeek(logicalDate: string, weekEndsOn = DEFAULT_WEEK_ENDS_ON) {
  return addDays(logicalDate, -((dayOfWeek(logicalDate) - weekStartsOn(weekEndsOn) + 7) % 7));
}

export function endOfWeek(logicalDate: string, weekEndsOn = DEFAULT_WEEK_ENDS_ON) {
  return addDays(startOfWeek(logicalDate, weekEndsOn), 6);
}

/** A new goal starts on the date the device sent, or the server's date when none was sent. */
export function goalStartDate(requested?: string) {
  if (requested === undefined) return logicalDateFromDate();
  if (typeof requested !== "string" || !isLogicalDate(requested)) throw new Error("Choose a valid goal start date.");
  return requested;
}

function isGoalDateActive(goal: Pick<Goal, "startDate" | "endDate">, logicalDate: string) {
  return (!goal.startDate || logicalDate >= goal.startDate) && (!goal.endDate || logicalDate <= goal.endDate);
}

export function isGoalDateScheduled(goal: Pick<Goal, "repeatType" | "scheduleType" | "weekdaysMask" | "startDate" | "endDate">, logicalDate: string) {
  if (!isGoalDateActive(goal, logicalDate)) return false;
  return (goalWeekdayMask(goal) & (1 << dayOfWeek(logicalDate))) !== 0;
}

export function buildGoalHistory({
  goal: storedGoal,
  startDate,
  endDate,
  completedDates,
  firstCompletedDate,
  weekEndsOn = DEFAULT_WEEK_ENDS_ON,
  asOf = logicalDateFromDate(),
}: {
  goal: Goal;
  startDate: string;
  endDate: string;
  completedDates: Iterable<string>;
  /** The goal's earliest completion on any date, which may fall outside the requested range. */
  firstCompletedDate?: string | null;
  weekEndsOn?: number;
  asOf?: string;
}): GoalHistory {
  if (!isLogicalDate(startDate) || !isLogicalDate(endDate) || startDate > endDate || !isLogicalDate(asOf)) throw new Error("Choose a valid history range.");
  // A goal counts from its start date, or from its first completion when that came earlier,
  // for example a goal created after midnight and then ticked for yesterday.
  const goal = storedGoal.startDate && firstCompletedDate && firstCompletedDate < storedGoal.startDate
    ? { ...storedGoal, startDate: firstCompletedDate }
    : storedGoal;
  const completed = new Set(completedDates);
  const days: GoalHistoryDay[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    days.push({ logicalDate: date, completed: completed.has(date), scheduled: isGoalDateScheduled(goal, date) });
  }

  const weeks: GoalHistoryWeek[] = [];
  const repeatType = goalRepeatType(goal);
  for (let weekStart = startOfWeek(startDate, weekEndsOn); weekStart <= endDate; weekStart = addDays(weekStart, 7)) {
    const weekEnd = addDays(weekStart, 6);
    const weekDates: string[] = [];
    for (let date = weekStart; date <= weekEnd; date = addDays(date, 1)) weekDates.push(date);
    const activeDates = weekDates.filter((date) => isGoalDateActive(goal, date));
    const evaluationDates = repeatType === "weekly"
      ? activeDates
      : activeDates.filter((date) => isGoalDateScheduled(goal, date));
    if (evaluationDates.length === 0) continue;
    const completedCount = evaluationDates.filter((date) => completed.has(date)).length;
    const expectedCount = repeatType === "weekly"
      ? Math.min(goal.targetPerWeek ?? 1, evaluationDates.length)
      : evaluationDates.length;
    // Days from today onward that are not completed yet can still count toward the target.
    const openCount = evaluationDates.filter((date) => date >= asOf && !completed.has(date)).length;
    // Upcoming: the week, or the goal's active period in it, has not begun.
    // Accomplished: the target is met, even before the week ends.
    // Not accomplished: the target is out of reach, even if every open day gets completed.
    // In progress: otherwise.
    const status: GoalHistoryWeek["status"] = activeDates[0] > asOf
      ? "upcoming"
      : completedCount >= expectedCount
        ? "accomplished"
        : completedCount + openCount < expectedCount
          ? "not_accomplished"
          : "in_progress";
    weeks.push({
      weekStart,
      weekEnd,
      completedCount,
      expectedCount,
      repeatType,
      status,
      accomplished: status === "accomplished" ? true : status === "not_accomplished" ? false : null,
    });
  }
  return { goal: storedGoal, month: startDate.slice(0, 7), startDate, endDate, asOf, days, weeks };
}

export function isTime(value: string) {
  return isValidTime(value);
}

import { ACTIVITY_ICON_CHOICES, iconForActivity } from "./icons.ts";
import { isValidTime, validateEntryInput, validateEntryReferences } from "./entry-validation.ts";

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

export type Bootstrap = {
  moods: Mood[];
  groups: ActivityGroup[];
  activities: Activity[];
  goals: Goal[];
  entries: Entry[];
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
  { id: "mood-rad", name: "Rad", score: 5, emoji: "😍", color: "#ee8f6d" },
  { id: "mood-good", name: "Good", score: 4, emoji: "🙂", color: "#f4b85f" },
  { id: "mood-meh", name: "Meh", score: 3, emoji: "😐", color: "#9aa4ae" },
  { id: "mood-bad", name: "Bad", score: 2, emoji: "🙁", color: "#809bc5" },
  { id: "mood-awful", name: "Awful", score: 1, emoji: "😣", color: "#9b82b6" },
];

const seedGroups: ActivityGroup[] = [
  { id: "group-health", name: "Health", sortOrder: 0, archived: false },
  { id: "group-work", name: "Work", sortOrder: 1, archived: false },
  { id: "group-home", name: "Home", sortOrder: 2, archived: false },
  { id: "group-people", name: "People", sortOrder: 3, archived: false },
  { id: "group-leisure", name: "Leisure", sortOrder: 4, archived: false },
];

const seedActivities: Activity[] = [
  ["gym", "Health", "fitness_center", "🏋️"],
  ["walk", "Health", "directions_walk", "🚶"],
  ["sleep", "Health", "bedtime", "🌙"],
  ["deep-work", "Work", "laptop_mac", "💻"],
  ["meetings", "Work", "groups", "👥"],
  ["cook", "Home", "restaurant", "🍳"],
  ["chores", "Home", "cleaning_services", "🧹"],
  ["family", "People", "favorite", "💛"],
  ["friends", "People", "celebration", "🎉"],
  ["reading", "Leisure", "menu_book", "📚"],
  ["gaming", "Leisure", "sports_esports", "🎮"],
  ["music", "Leisure", "music_note", "🎵"],
].map(([id, groupName, icon], index) => ({
  id: `activity-${id}`,
  groupId: seedGroups.find((group) => group.name === groupName)?.id ?? "group-health",
  name: id === "deep-work" ? "Deep work" : id[0].toUpperCase() + id.slice(1),
  icon,
  sourceIconId: icon,
  sortOrder: index,
  archived: false,
}));

const seedGoals: Goal[] = [
  {
    id: "goal-move",
    activityId: "activity-gym",
    name: "Move your body",
    materialIcon: "fitness_center",
    repeatType: "weekly",
    scheduleType: "times_per_week",
    targetPerWeek: 3,
    sortOrder: 0,
    archived: false,
    reminderEnabled: false,
  },
  {
    id: "goal-read",
    activityId: "activity-reading",
    name: "Read",
    materialIcon: "menu_book",
    repeatType: "daily",
    scheduleType: "daily",
    weekdaysMask: ALL_WEEKDAYS_MASK,
    sortOrder: 1,
    archived: false,
    reminderEnabled: false,
  },
];

function nowIso() {
  return new Date().toISOString();
}

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
  return typeof value === "string" && ACTIVITY_ICON_CHOICES.some((choice) => choice.name === value);
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

export function startOfWeek(logicalDate: string) {
  return addDays(logicalDate, -dayOfWeek(logicalDate));
}

export function endOfWeek(logicalDate: string) {
  return addDays(startOfWeek(logicalDate), 6);
}

function isGoalDateActive(goal: Pick<Goal, "startDate" | "endDate">, logicalDate: string) {
  return (!goal.startDate || logicalDate >= goal.startDate) && (!goal.endDate || logicalDate <= goal.endDate);
}

export function isGoalDateScheduled(goal: Pick<Goal, "repeatType" | "scheduleType" | "weekdaysMask" | "startDate" | "endDate">, logicalDate: string) {
  if (!isGoalDateActive(goal, logicalDate)) return false;
  return (goalWeekdayMask(goal) & (1 << dayOfWeek(logicalDate))) !== 0;
}

export function buildGoalHistory({
  goal,
  startDate,
  endDate,
  completedDates,
  asOf = logicalDateFromDate(),
}: {
  goal: Goal;
  startDate: string;
  endDate: string;
  completedDates: Iterable<string>;
  asOf?: string;
}): GoalHistory {
  if (!isLogicalDate(startDate) || !isLogicalDate(endDate) || startDate > endDate || !isLogicalDate(asOf)) throw new Error("Choose a valid history range.");
  const completed = new Set(completedDates);
  const days: GoalHistoryDay[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    days.push({ logicalDate: date, completed: completed.has(date), scheduled: isGoalDateScheduled(goal, date) });
  }

  const weeks: GoalHistoryWeek[] = [];
  const repeatType = goalRepeatType(goal);
  for (let weekStart = startOfWeek(startDate); weekStart <= endDate; weekStart = addDays(weekStart, 7)) {
    const weekEnd = endOfWeek(weekStart);
    const weekDates: string[] = [];
    for (let date = weekStart; date <= weekEnd; date = addDays(date, 1)) weekDates.push(date);
    const evaluationDates = repeatType === "weekly"
      ? weekDates.filter((date) => isGoalDateActive(goal, date))
      : weekDates.filter((date) => isGoalDateScheduled(goal, date));
    if (evaluationDates.length === 0) continue;
    const completedCount = evaluationDates.filter((date) => completed.has(date)).length;
    const expectedCount = repeatType === "weekly"
      ? Math.min(goal.targetPerWeek ?? 1, evaluationDates.length)
      : evaluationDates.length;
    const firstEvaluationDate = evaluationDates[0];
    const lastEvaluationDate = evaluationDates[evaluationDates.length - 1];
    const future = firstEvaluationDate > asOf;
    const targetReached = completedCount >= expectedCount;
    const past = lastEvaluationDate < asOf;
    const accomplished = future ? null : targetReached ? true : past ? false : null;
    weeks.push({
      weekStart,
      weekEnd,
      completedCount,
      expectedCount,
      repeatType,
      status: future ? "upcoming" : targetReached ? "accomplished" : past ? "not_accomplished" : "in_progress",
      accomplished,
    });
  }
  return { goal, month: startDate.slice(0, 7), startDate, endDate, asOf, days, weeks };
}

export function isTime(value: string) {
  return isValidTime(value);
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function goalCompletionKey(logicalDate: string, goalId: string) {
  return `${logicalDate}:${goalId}`;
}

function dayActivitySelectionKey(logicalDate: string, activityId: string) {
  return `${logicalDate}:${activityId}`;
}

export class DaylioMemoryStore {
  private moods = new Map(MOODS.map((mood) => [mood.id, mood]));
  private groups = new Map(seedGroups.map((group) => [group.id, group]));
  private activities = new Map(seedActivities.map((activity) => [activity.id, activity]));
  private goals = new Map(seedGoals.map((goal) => [goal.id, goal]));
  private entries = new Map<string, Entry>();
  private goalCompletions = new Map<string, { goalId: string; logicalDate: string; entryId?: string; createdAt: string; updatedAt: string }>();
  private dayMoodSelections = new Map<string, { moodId: string; createdAt: string; updatedAt: string }>();
  private dayActivitySelections = new Map<string, { logicalDate: string; activityId: string; selected: boolean; createdAt: string; updatedAt: string }>();

  private completedGoalIdsForDate(logicalDate: string) {
    return [...this.goalCompletions.values()]
      .filter((completion) => completion.logicalDate === logicalDate)
      .map((completion) => completion.goalId);
  }

  private withGoalCompletions(entry: Entry): Entry {
    return { ...entry, completedGoalIds: this.completedGoalIdsForDate(entry.logicalDate) };
  }

  bootstrap(): Bootstrap {
    const today = logicalDateFromDate();
    const yesterday = addDays(today, -1);
    return {
      moods: [...this.moods.values()].sort((a, b) => b.score - a.score),
      groups: [...this.groups.values()].sort((a, b) => a.sortOrder - b.sortOrder),
      activities: [...this.activities.values()].sort((a, b) => a.sortOrder - b.sortOrder),
      goals: [...this.goals.values()].sort((a, b) => a.sortOrder - b.sortOrder),
      entries: this.listEntries(30),
      today,
      yesterday,
    };
  }

  listEntries(limit = 30, offset = 0) {
    return [...this.entries.values()]
      .filter((entry) => !entry.deletedAt)
      .sort((a, b) => b.logicalDate.localeCompare(a.logicalDate))
      .slice(offset, offset + limit)
      .map((entry) => this.withGoalCompletions(entry));
  }

  listEntryDates(startDate: string, endDate: string) {
    return this.listEntryDays(startDate, endDate).map((day) => day.logicalDate);
  }

  listEntryDays(startDate: string, endDate: string): CalendarEntryDay[] {
    return [...this.entries.values()]
      .filter((entry) => !entry.deletedAt && entry.logicalDate >= startDate && entry.logicalDate <= endDate)
      .map((entry) => ({
        logicalDate: entry.logicalDate,
        moodId: this.dayMoodSelections.get(entry.logicalDate)?.moodId ?? entry.moodId,
      }))
      .sort((a, b) => a.logicalDate.localeCompare(b.logicalDate));
  }

  getEntry(logicalDate: string) {
    const entry = this.entries.get(logicalDate);
    if (!entry || entry.deletedAt) return null;
    const selections = this.getDaySelections(logicalDate);
    return this.withGoalCompletions({
      ...entry,
      moodId: selections.moodId ?? entry.moodId,
      activityIds: selections.activityIds,
    });
  }

  getDaySelections(logicalDate: string): DaySelections {
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    const entry = this.entries.get(logicalDate);
    const activeEntry = entry && !entry.deletedAt ? entry : null;
    const moodSelection = this.dayMoodSelections.get(logicalDate);
    const activityIds = new Set(activeEntry?.activityIds ?? []);
    const activityOverrideIds: string[] = [];
    for (const selection of this.dayActivitySelections.values()) {
      if (selection.logicalDate !== logicalDate) continue;
      activityOverrideIds.push(selection.activityId);
      if (selection.selected) activityIds.add(selection.activityId);
      else activityIds.delete(selection.activityId);
    }
    return {
      logicalDate,
      moodId: moodSelection?.moodId ?? activeEntry?.moodId ?? null,
      activityIds: [...activityIds],
      moodOverride: Boolean(moodSelection),
      activityOverrideIds,
    };
  }

  setMoodSelection(logicalDate: string, moodId: string): DayMoodSelection {
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    if (typeof moodId !== "string" || !this.moods.has(moodId)) throw new Error("Choose one of the five moods.");
    const timestamp = nowIso();
    const current = this.dayMoodSelections.get(logicalDate);
    this.dayMoodSelections.set(logicalDate, { moodId, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp });
    return { logicalDate, moodId };
  }

  private storeActivitySelection(logicalDate: string, activityId: string, selected: boolean): DayActivitySelection {
    const timestamp = nowIso();
    const key = dayActivitySelectionKey(logicalDate, activityId);
    const current = this.dayActivitySelections.get(key);
    this.dayActivitySelections.set(key, { logicalDate, activityId, selected, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp });
    return { logicalDate, activityId, selected };
  }

  setActivitySelection(logicalDate: string, activityId: string, selected: boolean): SelectionMutationResult {
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    if (typeof activityId !== "string" || !this.activities.has(activityId)) throw new Error("One activity is no longer available.");
    if (typeof selected !== "boolean") throw new Error("Activity selection must be a boolean.");
    const selection = this.storeActivitySelection(logicalDate, activityId, selected);
    const affectedGoals = [...this.goals.values()].filter((goal) => !goal.archived && goal.activityId === activityId);
    const entry = this.entries.get(logicalDate);
    const timestamp = nowIso();
    const entryId = entry && !entry.deletedAt ? entry.id : undefined;
    for (const goal of affectedGoals) {
      const key = goalCompletionKey(logicalDate, goal.id);
      if (!selected) {
        this.goalCompletions.delete(key);
        continue;
      }
      const current = this.goalCompletions.get(key);
      this.goalCompletions.set(key, { goalId: goal.id, logicalDate, entryId, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp });
    }
    if (entry && !entry.deletedAt) entry.completedGoalIds = this.completedGoalIdsForDate(logicalDate);
    return {
      selection,
      affectedGoalCompletions: affectedGoals.map((goal) => ({ goalId: goal.id, logicalDate, completed: selected, entryId })),
      affectedActivitySelections: [selection],
    };
  }

  getGoalCompletionIds(logicalDate: string) {
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    return this.completedGoalIdsForDate(logicalDate);
  }

  setGoalCompletion(logicalDate: string, goalId: string, completed: boolean): SelectionMutationResult {
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    if (typeof goalId !== "string" || !goalId.trim() || !this.goals.has(goalId)) throw new Error("One goal is no longer available.");
    if (typeof completed !== "boolean") throw new Error("Goal completion must be a boolean.");

    const goal = this.goals.get(goalId)!;
    const affectedGoals = goal.activityId
      ? [...this.goals.values()].filter((candidate) => !candidate.archived && candidate.activityId === goal.activityId)
      : [goal];
    const entry = this.entries.get(logicalDate);
    const timestamp = nowIso();
    const entryId = entry && !entry.deletedAt ? entry.id : undefined;
    for (const affectedGoal of affectedGoals) {
      const key = goalCompletionKey(logicalDate, affectedGoal.id);
      if (!completed) {
        this.goalCompletions.delete(key);
        continue;
      }
      const current = this.goalCompletions.get(key);
      this.goalCompletions.set(key, { goalId: affectedGoal.id, logicalDate, entryId, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp });
    }
    if (entry && !entry.deletedAt) entry.completedGoalIds = this.completedGoalIdsForDate(logicalDate);
    const selection = goal.activityId
      ? this.storeActivitySelection(logicalDate, goal.activityId, completed)
      : undefined;
    return {
      completion: { goalId, logicalDate, completed, entryId },
      selection,
      affectedGoalCompletions: affectedGoals.map((affectedGoal) => ({
        goalId: affectedGoal.id,
        logicalDate,
        completed,
        entryId,
      })),
      affectedActivitySelections: selection ? [selection] : [],
    };
  }

  saveEntry(logicalDate: string, input: unknown) {
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    const validated = validateEntryInput(input);
    validateEntryReferences(validated, { moodIds: this.moods, activityIds: this.activities, goalIds: this.goals });

    const persisted = this.entries.get(logicalDate);
    const existing = persisted && !persisted.deletedAt ? persisted : undefined;
    if (existing && validated.expectedVersion !== undefined && existing.version !== validated.expectedVersion) {
      const error = new Error("This entry changed on another device.");
      (error as Error & { code?: string }).code = "VERSION_CONFLICT";
      throw error;
    }
    const selections = this.getDaySelections(logicalDate);
    const activityIds = new Set(validated.activityIds);
    for (const activityId of selections.activityOverrideIds) {
      if (selections.activityIds.includes(activityId)) activityIds.add(activityId);
      else activityIds.delete(activityId);
    }
    const timestamp = nowIso();
    const entry: Entry = {
      id: existing?.id ?? persisted?.id ?? newId("entry"),
      logicalDate,
      localTime: validated.localTime ?? existing?.localTime ?? "23:00",
      timezone: validated.timezone ?? existing?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffsetMinutes: validated.timezoneOffsetMinutes ?? existing?.timezoneOffsetMinutes,
      moodId: selections.moodId ?? validated.moodId,
      activityIds: [...activityIds],
      completedGoalIds: this.completedGoalIdsForDate(logicalDate),
      legacyNoteTitle: validated.legacyNoteTitle ?? existing?.legacyNoteTitle,
      legacyNote: validated.legacyNote ?? existing?.legacyNote,
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.entries.set(logicalDate, entry);
    this.dayMoodSelections.delete(logicalDate);
    for (const key of [...this.dayActivitySelections.keys()]) {
      if (key.startsWith(`${logicalDate}:`)) this.dayActivitySelections.delete(key);
    }
    const goalIds = entry.completedGoalIds;
    for (const goalId of goalIds) {
      const key = goalCompletionKey(logicalDate, goalId);
      const current = this.goalCompletions.get(key);
      this.goalCompletions.set(key, { goalId, logicalDate, entryId: entry.id, createdAt: current?.createdAt ?? timestamp, updatedAt: current?.updatedAt ?? timestamp });
    }
    return this.withGoalCompletions(entry);
  }

  deleteEntry(logicalDate: string, expectedVersion?: number) {
    const existing = this.entries.get(logicalDate);
    if (!existing || existing.deletedAt) return null;
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      const error = new Error("This entry changed on another device.");
      (error as Error & { code?: string }).code = "VERSION_CONFLICT";
      throw error;
    }
    const deleted = { ...existing, deletedAt: nowIso(), updatedAt: nowIso(), version: existing.version + 1 };
    this.entries.set(logicalDate, deleted);
    return this.withGoalCompletions(deleted);
  }

  createGroup(name: string) {
    const clean = name.trim();
    if (!clean) throw new Error("Group name is required.");
    const group: ActivityGroup = { id: newId("group"), name: clean, sortOrder: this.groups.size, archived: false };
    this.groups.set(group.id, group);
    return group;
  }

  updateGroup(id: string, patch: Partial<Pick<ActivityGroup, "name" | "sortOrder" | "archived">>) {
    const group = this.groups.get(id);
    if (!group) throw new Error("Group not found.");
    const next = { ...group, ...patch, name: patch.name?.trim() || group.name };
    this.groups.set(id, next);
    return next;
  }

  createActivity(name: string, groupId: string, icon = "category") {
    const clean = name.trim();
    if (!clean) throw new Error("Activity name is required.");
    if (!this.groups.has(groupId)) throw new Error("Choose an activity group.");
    const activity: Activity = { id: newId("activity"), groupId, name: clean, icon: iconForActivity(clean, icon), sortOrder: this.activities.size, archived: false };
    this.activities.set(activity.id, activity);
    return activity;
  }

  updateActivity(id: string, patch: Partial<Pick<Activity, "name" | "groupId" | "icon" | "sortOrder" | "archived">>) {
    const activity = this.activities.get(id);
    if (!activity) throw new Error("Activity not found.");
    const next = { ...activity, ...patch, icon: patch.icon ? iconForActivity(activity.name, patch.icon) : activity.icon, name: patch.name?.trim() || activity.name };
    this.activities.set(id, next);
    return next;
  }

  createGoal(input: { name: string; activityId?: string | null; repeatType?: GoalRepeatType; scheduleType?: Goal["scheduleType"]; targetPerWeek?: number | null; weekdaysMask?: number | null; materialIcon?: string; reminderEnabled?: boolean; reminderTime?: string }) {
    if (input.activityId !== null && input.activityId !== undefined && !this.activities.has(input.activityId)) throw new Error("Choose an activity for the goal.");
    const config = normalizeGoalConfig(input);
    const goal: Goal = {
      id: newId("goal"),
      activityId: input.activityId ?? null,
      name: input.name.trim() || "Activity goal",
      materialIcon: isGoalIcon(input.materialIcon) ? input.materialIcon : "task_alt",
      ...config,
      sortOrder: this.goals.size,
      archived: false,
      reminderEnabled: input.reminderEnabled ?? false,
      reminderTime: input.reminderTime,
    };
    this.goals.set(goal.id, goal);
    return goal;
  }

  updateGoal(id: string, patch: Partial<Goal>) {
    const goal = this.goals.get(id);
    if (!goal) throw new Error("Goal not found.");
    if (patch.activityId !== undefined && patch.activityId !== null && !this.activities.has(patch.activityId)) throw new Error("Choose an activity for the goal.");
    const config = normalizeGoalConfig({
      repeatType: patch.repeatType ?? (patch.scheduleType ? patch.scheduleType === "times_per_week" ? "weekly" : "daily" : goalRepeatType(goal)),
      scheduleType: patch.scheduleType ?? goal.scheduleType,
      targetPerWeek: patch.targetPerWeek === undefined ? goal.targetPerWeek : patch.targetPerWeek,
      weekdaysMask: patch.weekdaysMask === undefined ? goalWeekdayMask(goal) : patch.weekdaysMask,
    });
    const next = { ...goal, ...patch, ...config, materialIcon: isGoalIcon(patch.materialIcon) ? patch.materialIcon : patch.materialIcon === undefined ? goal.materialIcon : "task_alt" };
    this.goals.set(id, next);
    return next;
  }

  getGoalHistory({ goalId, startDate, endDate, asOf }: GoalHistoryRequest): GoalHistory {
    if (!isLogicalDate(startDate) || !isLogicalDate(endDate) || startDate > endDate) throw new Error("Choose a valid history range.");
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error("Goal not found.");
    const completedDates = [...this.goalCompletions.values()]
      .filter((completion) => completion.goalId === goalId && completion.logicalDate >= startOfWeek(startDate) && completion.logicalDate <= endOfWeek(endDate))
      .map((completion) => completion.logicalDate);
    return buildGoalHistory({ goal, startDate, endDate, completedDates, asOf });
  }

  exportData() {
    return {
      formatVersion: 1,
      exportedAt: nowIso(),
      moods: [...this.moods.values()],
      groups: [...this.groups.values()],
      activities: [...this.activities.values()],
      goals: [...this.goals.values()],
      entries: [...this.entries.values()].map((entry) => this.withGoalCompletions(entry)),
    };
  }

  importData(payload: ImportPayload) {
    const moodIds = new Map<string, string>();
    for (const mood of payload.moods) {
      const existing = [...this.moods.values()].find((candidate) => candidate.name.toLowerCase() === mood.name.toLowerCase());
      moodIds.set(mood.sourceId, existing?.id ?? `daylio-mood-${mood.sourceId}`);
      if (!existing) this.moods.set(`daylio-mood-${mood.sourceId}`, { id: `daylio-mood-${mood.sourceId}`, name: mood.name, score: mood.score, emoji: mood.emoji ?? "🙂", color: "#9aa4ae" });
    }
    const groupIds = new Map<string, string>();
    for (const group of payload.groups) {
      const id = `daylio-group-${group.sourceId}`;
      groupIds.set(group.sourceId, id);
      this.groups.set(id, { id, name: group.name, sortOrder: group.sortOrder, archived: Boolean(group.archived) });
    }
    const activityIds = new Map<string, string>();
    for (const activity of payload.activities) {
      const id = `daylio-activity-${activity.sourceId}`;
      activityIds.set(activity.sourceId, id);
      this.activities.set(id, { id, groupId: groupIds.get(activity.groupSourceId ?? "") ?? [...this.groups.keys()][0], name: activity.name, icon: iconForActivity(activity.name, activity.sourceIconId), sourceIconId: activity.sourceIconId, sortOrder: activity.sortOrder, archived: Boolean(activity.archived) });
    }
    const goalIds = new Map<string, string>();
    for (const goal of payload.goals) {
      const id = `daylio-goal-${goal.sourceId}`;
      goalIds.set(goal.sourceId, id);
      const config = normalizeGoalConfig({ repeatType: goal.repeatType, scheduleType: goal.scheduleType, targetPerWeek: goal.targetPerWeek, weekdaysMask: goal.weekdaysMask });
      this.goals.set(id, { id, activityId: activityIds.get(goal.activitySourceId ?? "") ?? null, name: goal.name || "Activity goal", materialIcon: isGoalIcon(goal.materialIcon) ? goal.materialIcon : "task_alt", ...config, sortOrder: goal.sortOrder, archived: Boolean(goal.archived), reminderEnabled: Boolean(goal.reminderEnabled), reminderTime: goal.reminderTime, sourceState: goal.sourceState });
    }
    for (const item of payload.entries) {
      this.entries.set(item.logicalDate, { id: `daylio-entry-${item.sourceId}`, logicalDate: item.logicalDate, localTime: item.localTime, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, timezoneOffsetMinutes: item.timezoneOffsetMinutes, moodId: moodIds.get(item.moodSourceId) ?? "mood-meh", activityIds: item.activitySourceIds.map((id) => activityIds.get(id)).filter(Boolean) as string[], completedGoalIds: [], legacyNoteTitle: item.legacyNoteTitle, legacyNote: item.legacyNote, version: 1, createdAt: nowIso(), updatedAt: nowIso() });
    }
    for (const completion of payload.completions) {
      const entry = this.entries.get(completion.logicalDate);
      const goalId = goalIds.get(completion.goalSourceId);
      if (goalId) {
        const timestamp = nowIso();
        this.goalCompletions.set(goalCompletionKey(completion.logicalDate, goalId), { goalId, logicalDate: completion.logicalDate, entryId: entry?.id, createdAt: timestamp, updatedAt: timestamp });
      }
    }
    return this.bootstrap();
  }
}

const globalStore = globalThis as typeof globalThis & { __daylioStore?: DaylioMemoryStore };
export const store = globalStore.__daylioStore ?? (globalStore.__daylioStore = new DaylioMemoryStore());

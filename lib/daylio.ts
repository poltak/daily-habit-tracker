import { iconForActivity } from "./icons";
import { isValidTime, validateEntryInput, validateEntryReferences } from "./entry-validation";

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
  activityId: string;
  name: string;
  scheduleType: "daily" | "weekdays" | "times_per_week";
  targetPerWeek?: number;
  weekdaysMask?: number;
  sortOrder: number;
  archived: boolean;
  reminderEnabled: boolean;
  reminderTime?: string;
  sourceState?: number;
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
    activitySourceId: string;
    name: string;
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
    scheduleType: "daily",
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

export function isTime(value: string) {
  return isValidTime(value);
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export class DaylioMemoryStore {
  private moods = new Map(MOODS.map((mood) => [mood.id, mood]));
  private groups = new Map(seedGroups.map((group) => [group.id, group]));
  private activities = new Map(seedActivities.map((activity) => [activity.id, activity]));
  private goals = new Map(seedGoals.map((goal) => [goal.id, goal]));
  private entries = new Map<string, Entry>();

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
      .slice(offset, offset + limit);
  }

  listEntryDates(startDate: string, endDate: string) {
    return [...this.entries.values()]
      .filter((entry) => !entry.deletedAt && entry.logicalDate >= startDate && entry.logicalDate <= endDate)
      .map((entry) => entry.logicalDate)
      .sort();
  }

  getEntry(logicalDate: string) {
    const entry = this.entries.get(logicalDate);
    return entry && !entry.deletedAt ? entry : null;
  }

  saveEntry(logicalDate: string, input: unknown) {
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    const validated = validateEntryInput(input);
    validateEntryReferences(validated, { moodIds: this.moods, activityIds: this.activities, goalIds: this.goals });

    const existing = this.entries.get(logicalDate);
    if (existing && validated.expectedVersion !== undefined && existing.version !== validated.expectedVersion) {
      const error = new Error("This entry changed on another device.");
      (error as Error & { code?: string }).code = "VERSION_CONFLICT";
      throw error;
    }
    const timestamp = nowIso();
    const entry: Entry = {
      id: existing?.id ?? newId("entry"),
      logicalDate,
      localTime: validated.localTime ?? existing?.localTime ?? "23:00",
      timezone: validated.timezone ?? existing?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffsetMinutes: validated.timezoneOffsetMinutes ?? existing?.timezoneOffsetMinutes,
      moodId: validated.moodId,
      activityIds: [...new Set(validated.activityIds)],
      completedGoalIds: [...new Set(validated.completedGoalIds)],
      legacyNoteTitle: validated.legacyNoteTitle ?? existing?.legacyNoteTitle,
      legacyNote: validated.legacyNote ?? existing?.legacyNote,
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.entries.set(logicalDate, entry);
    return entry;
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
    return deleted;
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

  createGoal(input: Pick<Goal, "name" | "activityId" | "scheduleType"> & Partial<Pick<Goal, "targetPerWeek" | "reminderEnabled" | "reminderTime">>) {
    if (!this.activities.has(input.activityId)) throw new Error("Choose an activity for the goal.");
    const goal: Goal = {
      id: newId("goal"),
      activityId: input.activityId,
      name: input.name.trim() || "Activity goal",
      scheduleType: input.scheduleType,
      targetPerWeek: input.targetPerWeek,
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
    const next = { ...goal, ...patch };
    this.goals.set(id, next);
    return next;
  }

  exportData() {
    return {
      formatVersion: 1,
      exportedAt: nowIso(),
      moods: [...this.moods.values()],
      groups: [...this.groups.values()],
      activities: [...this.activities.values()],
      goals: [...this.goals.values()],
      entries: [...this.entries.values()],
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
      this.goals.set(id, { id, activityId: activityIds.get(goal.activitySourceId) ?? "", name: goal.name || "Activity goal", scheduleType: goal.scheduleType, targetPerWeek: goal.targetPerWeek, weekdaysMask: goal.weekdaysMask, sortOrder: goal.sortOrder, archived: Boolean(goal.archived), reminderEnabled: Boolean(goal.reminderEnabled), reminderTime: goal.reminderTime, sourceState: goal.sourceState });
    }
    for (const item of payload.entries) {
      this.entries.set(item.logicalDate, { id: `daylio-entry-${item.sourceId}`, logicalDate: item.logicalDate, localTime: item.localTime, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, timezoneOffsetMinutes: item.timezoneOffsetMinutes, moodId: moodIds.get(item.moodSourceId) ?? "mood-meh", activityIds: item.activitySourceIds.map((id) => activityIds.get(id)).filter(Boolean) as string[], completedGoalIds: [], legacyNoteTitle: item.legacyNoteTitle, legacyNote: item.legacyNote, version: 1, createdAt: nowIso(), updatedAt: nowIso() });
    }
    for (const completion of payload.completions) {
      const entry = this.entries.get(completion.logicalDate);
      const goalId = goalIds.get(completion.goalSourceId);
      if (entry && goalId && !entry.completedGoalIds.includes(goalId)) entry.completedGoalIds.push(goalId);
    }
    return this.bootstrap();
  }
}

const globalStore = globalThis as typeof globalThis & { __daylioStore?: DaylioMemoryStore };
export const store = globalStore.__daylioStore ?? (globalStore.__daylioStore = new DaylioMemoryStore());

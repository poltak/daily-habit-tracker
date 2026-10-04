// An in-memory implementation of the journal store. The server always uses D1;
// this exists for tests and as the source of the seed catalog, and must stay
// out of the browser bundle.
import {
  type Activity,
  type ActivityGroup,
  type AppSettings,
  type Bootstrap,
  type CalendarEntryDay,
  type DayActivitySelection,
  type DayMoodSelection,
  type DaySelections,
  type Entry,
  type Goal,
  type GoalHistory,
  type GoalHistoryRequest,
  type GoalRepeatType,
  type HistorySpan,
  type ImportPayload,
  type SelectionMutationResult,
  ALL_WEEKDAYS_MASK,
  DEFAULT_SETTINGS,
  MOODS,
  addDays,
  buildGoalHistory,
  goalRepeatType,
  goalStartDate,
  goalWeekdayMask,
  isGoalIcon,
  isLogicalDate,
  logicalDateFromDate,
  normalizeGoalConfig,
  planDaySave,
  requireStartedDate,
  validateSettingsPatch,
} from "./daylio.ts";
import { iconForActivity } from "./icons.ts";
import { validateDayInput, validateEntryInput, validateEntryReferences, validateExpectedVersion, versionConflict } from "./entry-validation.ts";
import { validateCatalogPatch, validateCatalogReorder } from "./catalog-validation.ts";
import { validateImportPayload } from "./import-validation.ts";
import type { InsightsData } from "./insights.ts";

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
  private settings: AppSettings = { ...DEFAULT_SETTINGS };

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
      settings: { ...this.settings },
      today,
      yesterday,
    };
  }

  updateSettings(input: unknown): AppSettings {
    this.settings = { ...this.settings, ...validateSettingsPatch(input) };
    return { ...this.settings };
  }

  listEntries(limit = 30, offset = 0) {
    return [...this.entries.values()]
      .filter((entry) => !entry.deletedAt)
      .sort((a, b) => b.logicalDate.localeCompare(a.logicalDate))
      .slice(offset, offset + limit)
      .map((entry) => this.getEntry(entry.logicalDate)!);
  }

  listEntriesInRange(startDate: string, endDate: string) {
    if (!isLogicalDate(startDate) || !isLogicalDate(endDate) || startDate > endDate) throw new Error("Choose a valid date range.");
    return [...this.entries.values()]
      .filter((entry) => !entry.deletedAt && entry.logicalDate >= startDate && entry.logicalDate <= endDate)
      .sort((a, b) => a.logicalDate.localeCompare(b.logicalDate))
      .map((entry) => this.getEntry(entry.logicalDate)!);
  }

  getHistorySpan(): HistorySpan {
    const dates = [...this.entries.values()].filter((entry) => !entry.deletedAt).map((entry) => entry.logicalDate).sort();
    return { firstDate: dates[0] ?? null, lastDate: dates[dates.length - 1] ?? null, recordedDays: dates.length };
  }

  getInsightsData(): InsightsData {
    return {
      moods: [...this.moods.values()].sort((a, b) => b.score - a.score),
      groups: [...this.groups.values()].sort((a, b) => a.sortOrder - b.sortOrder),
      activities: [...this.activities.values()].sort((a, b) => a.sortOrder - b.sortOrder),
      days: [...this.entries.values()]
        .filter((entry) => !entry.deletedAt)
        .sort((a, b) => a.logicalDate.localeCompare(b.logicalDate))
        .map((entry) => {
          const selections = this.getDaySelections(entry.logicalDate);
          return {
            logicalDate: entry.logicalDate,
            moodId: selections.moodId ?? entry.moodId,
            activityIds: selections.activityIds,
          };
        }),
    };
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

  getEntryState(logicalDate: string) {
    return {
      entry: this.getEntry(logicalDate),
      completedGoalIds: this.getGoalCompletionIds(logicalDate),
      daySelections: this.getDaySelections(logicalDate),
    };
  }

  setMoodSelection(logicalDate: string, moodId: string): DayMoodSelection {
    requireStartedDate(logicalDate);
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
    requireStartedDate(logicalDate);
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
    requireStartedDate(logicalDate);
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
    requireStartedDate(logicalDate);
    const validated = validateEntryInput(input);
    validateEntryReferences(validated, { moodIds: this.moods, activityIds: this.activities, goalIds: this.goals });

    const persisted = this.entries.get(logicalDate);
    const existing = persisted && !persisted.deletedAt ? persisted : undefined;
    if (validated.expectedVersion !== undefined && (existing?.version ?? 0) !== validated.expectedVersion) throw versionConflict();
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
      moodId: selections.moodOverride ? selections.moodId! : validated.moodId,
      activityIds: [...activityIds],
      completedGoalIds: this.completedGoalIdsForDate(logicalDate),
      legacyNoteTitle: validated.legacyNoteTitle ?? existing?.legacyNoteTitle,
      legacyNote: validated.legacyNote ?? existing?.legacyNote,
      version: (persisted?.version ?? 0) + 1,
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

  saveDay(logicalDate: string, input: unknown) {
    requireStartedDate(logicalDate);
    const day = validateDayInput(input);
    const plan = planDaySave({ goals: [...this.goals.values()], activityIds: day.activityIds, completedGoalIds: day.completedGoalIds });
    const entryInput = { moodId: day.moodId, activityIds: plan.activityIds, completedGoalIds: [], expectedVersion: day.expectedVersion };
    // Check everything saveEntry would reject before changing any state.
    validateEntryReferences(entryInput, { moodIds: this.moods, activityIds: this.activities, goalIds: this.goals });
    const persisted = this.entries.get(logicalDate);
    const existingVersion = persisted && !persisted.deletedAt ? persisted.version : 0;
    if (day.expectedVersion !== undefined && existingVersion !== day.expectedVersion) throw versionConflict();

    this.dayMoodSelections.delete(logicalDate);
    for (const key of [...this.dayActivitySelections.keys()]) {
      if (key.startsWith(`${logicalDate}:`)) this.dayActivitySelections.delete(key);
    }
    const timestamp = nowIso();
    for (const goalId of plan.clearGoalIds) this.goalCompletions.delete(goalCompletionKey(logicalDate, goalId));
    for (const goalId of plan.completeGoalIds) {
      const key = goalCompletionKey(logicalDate, goalId);
      const current = this.goalCompletions.get(key);
      this.goalCompletions.set(key, { goalId, logicalDate, entryId: current?.entryId, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp });
    }
    return this.saveEntry(logicalDate, entryInput);
  }

  deleteEntry(logicalDate: string, expectedVersion?: number) {
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    validateExpectedVersion(expectedVersion);
    const existing = this.entries.get(logicalDate);
    if (!existing || existing.deletedAt) return null;
    if (expectedVersion !== undefined && existing.version !== expectedVersion) throw versionConflict();
    const deleted = { ...existing, deletedAt: nowIso(), updatedAt: nowIso(), version: existing.version + 1 };
    this.entries.set(logicalDate, deleted);
    return this.withGoalCompletions(deleted);
  }

  createGroup(name: string) {
    validateCatalogPatch({ kind: "group", patch: { name } });
    const clean = name.trim();
    if (!clean) throw new Error("Group name is required.");
    const group: ActivityGroup = { id: newId("group"), name: clean, sortOrder: this.groups.size, archived: false };
    this.groups.set(group.id, group);
    return group;
  }

  updateGroup(id: string, input: unknown) {
    const patch = validateCatalogPatch({ kind: "group", patch: input });
    const group = this.groups.get(id);
    if (!group) throw new Error("Group not found.");
    const next = { ...group, ...patch, name: patch.name?.trim() || group.name };
    this.groups.set(id, next);
    return next;
  }

  deleteGroup(id: string) {
    if (!this.groups.has(id)) throw new Error("Group not found.");
    for (const activity of [...this.activities.values()]) {
      if (activity.groupId === id) this.deleteActivity(activity.id);
    }
    this.groups.delete(id);
  }

  createActivity(name: string, groupId: string, icon = "category") {
    validateCatalogPatch({ kind: "activity", patch: { name, groupId, icon } });
    const clean = name.trim();
    if (!clean) throw new Error("Activity name is required.");
    if (!this.groups.has(groupId)) throw new Error("Choose an activity group.");
    const activity: Activity = { id: newId("activity"), groupId, name: clean, icon: iconForActivity(clean, icon), sortOrder: this.activities.size, archived: false };
    this.activities.set(activity.id, activity);
    return activity;
  }

  updateActivity(id: string, input: unknown) {
    const patch = validateCatalogPatch({ kind: "activity", patch: input });
    if (patch.groupId !== undefined && !this.groups.has(patch.groupId)) throw new Error("Choose an activity group.");
    const activity = this.activities.get(id);
    if (!activity) throw new Error("Activity not found.");
    const name = patch.name?.trim() || activity.name;
    const icon = iconForActivity(name, patch.icon ?? activity.icon);
    const next = { ...activity, ...patch, icon, name };
    this.activities.set(id, next);
    return next;
  }

  deleteActivity(id: string) {
    if (!this.activities.has(id)) throw new Error("Activity not found.");
    for (const [logicalDate, entry] of this.entries) {
      if (entry.activityIds.includes(id)) this.entries.set(logicalDate, { ...entry, activityIds: entry.activityIds.filter((activityId) => activityId !== id) });
    }
    for (const [key, selection] of this.dayActivitySelections) {
      if (selection.activityId === id) this.dayActivitySelections.delete(key);
    }
    for (const goal of this.goals.values()) {
      if (goal.activityId === id) this.goals.set(goal.id, { ...goal, activityId: null });
    }
    this.activities.delete(id);
  }

  createGoal(input: { name: string; activityId?: string | null; repeatType?: GoalRepeatType; scheduleType?: Goal["scheduleType"]; targetPerWeek?: number | null; weekdaysMask?: number | null; materialIcon?: string; reminderEnabled?: boolean; reminderTime?: string; startDate?: string }) {
    const { startDate, ...fields } = input;
    validateCatalogPatch({ kind: "goal", patch: fields });
    if (input.activityId !== null && input.activityId !== undefined && !this.activities.has(input.activityId)) throw new Error("Choose an activity for the goal.");
    const config = normalizeGoalConfig(input);
    const goal: Goal = {
      id: newId("goal"),
      activityId: input.activityId ?? null,
      name: input.name.trim() || "Activity goal",
      materialIcon: isGoalIcon(input.materialIcon) ? input.materialIcon : "task_alt",
      ...config,
      startDate: goalStartDate(startDate),
      sortOrder: this.goals.size,
      archived: false,
      reminderEnabled: input.reminderEnabled ?? false,
      reminderTime: input.reminderTime,
    };
    this.goals.set(goal.id, goal);
    return goal;
  }

  updateGoal(id: string, input: unknown) {
    const patch = validateCatalogPatch({ kind: "goal", patch: input });
    const goal = this.goals.get(id);
    if (!goal) throw new Error("Goal not found.");
    if (patch.activityId !== undefined && patch.activityId !== null && !this.activities.has(patch.activityId)) throw new Error("Choose an activity for the goal.");
    const config = normalizeGoalConfig({
      repeatType: patch.repeatType ?? (patch.scheduleType ? patch.scheduleType === "times_per_week" ? "weekly" : "daily" : goalRepeatType(goal)),
      scheduleType: patch.scheduleType ?? goal.scheduleType,
      targetPerWeek: patch.targetPerWeek === undefined ? goal.targetPerWeek : patch.targetPerWeek,
      weekdaysMask: patch.weekdaysMask === undefined ? goalWeekdayMask(goal) : patch.weekdaysMask,
    });
    const next = { ...goal, ...patch, ...config, name: patch.name?.trim() || goal.name, materialIcon: isGoalIcon(patch.materialIcon) ? patch.materialIcon : patch.materialIcon === undefined ? goal.materialIcon : "task_alt" };
    this.goals.set(id, next);
    return next;
  }

  deleteGoal(id: string) {
    if (!this.goals.has(id)) throw new Error("Goal not found.");
    for (const [key, completion] of this.goalCompletions) {
      if (completion.goalId === id) this.goalCompletions.delete(key);
    }
    this.goals.delete(id);
  }

  getGoalHistory({ goalId, startDate, endDate, asOf }: GoalHistoryRequest): GoalHistory {
    if (!isLogicalDate(startDate) || !isLogicalDate(endDate) || startDate > endDate) throw new Error("Choose a valid history range.");
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error("Goal not found.");
    const completedDates = [...this.goalCompletions.values()]
      .filter((completion) => completion.goalId === goalId)
      .map((completion) => completion.logicalDate)
      .sort();
    return buildGoalHistory({ goal, startDate, endDate, completedDates, firstCompletedDate: completedDates[0], weekEndsOn: this.settings.weekEndsOn, asOf });
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
      goalCompletions: [...this.goalCompletions.values()],
      settings: { ...this.settings },
      dayMoodSelections: [...this.dayMoodSelections].map(([logicalDate, selection]) => ({ logicalDate, ...selection })),
      dayActivitySelections: [...this.dayActivitySelections.values()],
    };
  }

  reorderCatalog(payload: unknown) {
    const { kind, updates } = validateCatalogReorder(payload);
    function apply<T extends { sortOrder: number }>(records: Map<string, T>) {
      const changes = updates.map((update) => {
        const record = records.get(update.id);
        if (!record) throw new Error("Catalog item not found.");
        if (record.sortOrder !== update.expectedSortOrder) throw versionConflict("Setup changed on another device. Refresh before reordering.");
        return { id: update.id, record: { ...record, sortOrder: update.sortOrder } };
      });
      for (const change of changes) records.set(change.id, change.record);
    }
    if (kind === "group") apply(this.groups);
    else if (kind === "activity") apply(this.activities);
    else apply(this.goals);
  }

  importData(payload: ImportPayload) {
    validateImportPayload(payload);
    for (const entry of payload.entries) {
      const current = this.entries.get(entry.logicalDate);
      if (current && current.id !== `daylio-entry-${entry.sourceId}`) throw new Error("Import would replace an entry from a different source.");
    }
    const moodIds = new Map<string, string>();
    for (const mood of payload.moods) {
      const canonical = MOODS.find((candidate) => candidate.score === mood.score)!;
      const existing = [...this.moods.values()].find((candidate) => candidate.score === mood.score);
      const id = existing?.id ?? canonical.id;
      moodIds.set(mood.sourceId, id);
      this.moods.set(id, { ...canonical, id });
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
      this.activities.set(id, { id, groupId: groupIds.get(activity.groupSourceId!)!, name: activity.name, icon: iconForActivity(activity.name, activity.sourceIconId), sourceIconId: activity.sourceIconId ?? undefined, sortOrder: activity.sortOrder, archived: Boolean(activity.archived) });
    }
    const goalIds = new Map<string, string>();
    for (const goal of payload.goals) {
      const id = `daylio-goal-${goal.sourceId}`;
      goalIds.set(goal.sourceId, id);
      const config = normalizeGoalConfig({ repeatType: goal.repeatType, scheduleType: goal.scheduleType, targetPerWeek: goal.targetPerWeek, weekdaysMask: goal.weekdaysMask });
      this.goals.set(id, { id, activityId: activityIds.get(goal.activitySourceId ?? "") ?? null, name: goal.name || "Activity goal", materialIcon: isGoalIcon(goal.materialIcon) ? goal.materialIcon : "task_alt", ...config, sortOrder: goal.sortOrder, archived: Boolean(goal.archived), reminderEnabled: Boolean(goal.reminderEnabled), reminderTime: goal.reminderTime, sourceState: goal.sourceState });
    }
    for (const item of payload.entries) {
      const existing = this.entries.get(item.logicalDate);
      this.entries.set(item.logicalDate, { id: `daylio-entry-${item.sourceId}`, logicalDate: item.logicalDate, localTime: item.localTime, timezone: existing?.timezone ?? "", timezoneOffsetMinutes: item.timezoneOffsetMinutes ?? undefined, moodId: moodIds.get(item.moodSourceId)!, activityIds: [...new Set(item.activitySourceIds.map((id) => activityIds.get(id)!))], completedGoalIds: [], legacyNoteTitle: item.legacyNoteTitle ?? undefined, legacyNote: item.legacyNote ?? undefined, version: (existing?.version ?? 0) + 1, createdAt: existing?.createdAt ?? nowIso(), updatedAt: nowIso(), deletedAt: existing?.deletedAt });
    }
    for (const completion of payload.completions) {
      const entry = this.entries.get(completion.logicalDate);
      const goalId = goalIds.get(completion.goalSourceId);
      if (goalId) {
        const timestamp = nowIso();
        this.goalCompletions.set(goalCompletionKey(completion.logicalDate, goalId), { goalId, logicalDate: completion.logicalDate, entryId: entry?.id, createdAt: timestamp, updatedAt: timestamp });
      }
    }
    // An imported goal starts on its first completion, or today when it has none.
    for (const goalId of goalIds.values()) {
      const goal = this.goals.get(goalId)!;
      if (goal.startDate) continue;
      const firstCompletion = [...this.goalCompletions.values()].filter((completion) => completion.goalId === goalId).map((completion) => completion.logicalDate).sort()[0];
      goal.startDate = firstCompletion ?? logicalDateFromDate();
    }
    return this.bootstrap();
  }
}

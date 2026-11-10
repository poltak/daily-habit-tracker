/** The days of the journal as the API gives them. */

export interface Entry {
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
}

/** What the owner chose for a day with taps, before the day is saved. */
export interface DaySelections {
  logicalDate: string;
  moodId: string | null;
  activityIds: string[];
  moodOverride: boolean;
  activityOverrideIds: string[];
}

export interface DayState {
  entry: Entry | null;
  completedGoalIds: string[];
  daySelections: DaySelections;
}

export interface GoalCompletion {
  goalId: string;
  logicalDate: string;
  completed: boolean;
  entryId?: string;
}

export interface DayActivitySelection {
  logicalDate: string;
  activityId: string;
  selected: boolean;
}

export interface CalendarEntryDay {
  logicalDate: string;
  moodId: string;
}

/** A saved day as the analysis reads it: the mood and the activities the owner sees for it. */
export interface EffectiveDay {
  logicalDate: string;
  moodId: string;
  activityIds: string[];
}

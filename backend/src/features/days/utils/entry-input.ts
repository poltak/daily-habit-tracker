/** What a save of an entry carries. */
export interface EntryInput {
  moodId: string;
  activityIds: string[];
  completedGoalIds: string[];
  localTime?: string | undefined;
  timezone?: string | undefined;
  timezoneOffsetMinutes?: number | undefined;
  /** The version the owner saw. 0 means that no entry exists yet. */
  expectedVersion?: number | undefined;
  legacyNoteTitle?: string | undefined;
  legacyNote?: string | undefined;
}

/** What a save of a whole day carries. */
export interface DayInput {
  moodId: string;
  activityIds: string[];
  /** Leave it out to keep the goals that have no activity as they are. */
  completedGoalIds?: string[] | undefined;
  expectedVersion?: number | undefined;
}

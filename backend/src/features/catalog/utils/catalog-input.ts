/** What a create or an update of a catalog item carries, after the request is checked. */

export interface GroupPatch {
  name?: string | undefined;
  sortOrder?: number | undefined;
  archived?: boolean | undefined;
}

export interface ActivityPatch {
  name?: string | undefined;
  groupId?: string | undefined;
  icon?: string | undefined;
  sortOrder?: number | undefined;
  archived?: boolean | undefined;
}

export interface GoalPatch {
  name?: string | undefined;
  activityId?: string | null | undefined;
  materialIcon?: string | undefined;
  repeatType?: string | undefined;
  scheduleType?: string | undefined;
  targetPerWeek?: number | null | undefined;
  weekdaysMask?: number | null | undefined;
  sortOrder?: number | undefined;
  archived?: boolean | undefined;
  reminderEnabled?: boolean | undefined;
  reminderTime?: string | undefined;
}

export interface GoalCreate {
  name?: string | undefined;
  activityId?: string | null | undefined;
  materialIcon?: string | undefined;
  repeatType?: string | undefined;
  scheduleType?: string | undefined;
  targetPerWeek?: number | null | undefined;
  weekdaysMask?: number | null | undefined;
  startDate?: string | undefined;
  reminderEnabled?: boolean | undefined;
  reminderTime?: string | undefined;
}

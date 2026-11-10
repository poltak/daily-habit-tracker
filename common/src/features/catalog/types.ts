/** The catalog of the journal as `GET /api/catalog` gives it. */

export interface Mood {
  id: string;
  name: string;
  /** 1 (awful) to 5 (rad). */
  score: number;
  emoji: string;
  color: string;
}

export interface ActivityGroup {
  id: string;
  name: string;
  sortOrder: number;
  archived: boolean;
}

export interface Activity {
  id: string;
  groupId: string;
  name: string;
  /** A name of the Material Symbols Rounded font. */
  icon: string;
  sourceIconId?: string;
  sortOrder: number;
  archived: boolean;
}

export type GoalRepeatType = "daily" | "weekly";

export type GoalScheduleType = "daily" | "weekdays" | "times_per_week";

export interface Goal {
  id: string;
  activityId: string | null;
  name: string;
  materialIcon: string;
  repeatType: GoalRepeatType;
  scheduleType: GoalScheduleType;
  targetPerWeek?: number;
  weekdaysMask?: number;
  startDate?: string;
  endDate?: string;
  sortOrder: number;
  archived: boolean;
  reminderEnabled: boolean;
  reminderTime?: string;
  sourceState?: number;
}

export interface Catalog {
  moods: Mood[];
  groups: ActivityGroup[];
  activities: Activity[];
  goals: Goal[];
}

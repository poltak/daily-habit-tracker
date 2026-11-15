import type { InsightsDay, MoodSummary } from "../types.js";

/** The offsets used by the calendar-day relationship view. */
export const ACTIVITY_CALENDAR_OFFSETS = [-1, 0, 1, 2] as const;
export type ActivityCalendarOffset = (typeof ACTIVITY_CALENDAR_OFFSETS)[number];

export interface RelationshipDayFilter {
  /** Calendar year, or null/undefined for all years. */
  year?: number | null;
  /** JavaScript calendar weekday (0 = Sunday), or null/undefined for all weekdays. */
  weekday?: number | null;
}

export interface RelationshipMoodSummary extends MoodSummary {
  /** Number of days with a known mood in this group. */
  sampleSize: number;
}

export interface ActivityMoodAssociation {
  activityId: string;
  recorded: RelationshipMoodSummary;
  notRecorded: RelationshipMoodSummary;
  meanDifference: number | null;
  goodRateDifference: number | null;
  /** The mean difference used for descending ranking when it is available. */
  associationScore: number | null;
  /** A deliberately visible signal that one side has a small mood sample. */
  sparse: boolean;
  sparseGroups: ("recorded" | "notRecorded")[];
}

export interface ActivityCalendarOffsetComparison {
  offset: ActivityCalendarOffset;
  label: string;
  recorded: RelationshipMoodSummary;
  notRecorded: RelationshipMoodSummary;
}

export interface ActivityCalendarComparison {
  activityId: string;
  /** Number of anchor days in each cohort, including days without a mood. */
  anchorCounts: {
    recorded: number;
    notRecorded: number;
  };
  offsets: ActivityCalendarOffsetComparison[];
}

export const ACTIVITY_PAIR_GROUPS = [
  "neither",
  "aOnly",
  "bOnly",
  "both",
] as const;
export type ActivityPairGroup = (typeof ACTIVITY_PAIR_GROUPS)[number];

export interface ActivityPairComparison {
  pairKey: string;
  activityAId: string;
  activityBId: string;
  groups: Record<ActivityPairGroup, RelationshipMoodSummary>;
  sampleSizes: Record<ActivityPairGroup, number>;
  minObservations: number;
  adequate: boolean;
  sparseGroups: ActivityPairGroup[];
  /** Difference between the highest and lowest available group mean. */
  meanRange: number | null;
}

export interface ActivityPairOptions {
  /** Suggestions require this many known-mood observations in every group. */
  minObservations?: number;
  /** Optional maximum number of eligible suggestions returned by the ranking helper. */
  limit?: number;
}

/** The days of the analysis, as the relationship functions take them. */
export type RelationshipDays = readonly InsightsDay[];

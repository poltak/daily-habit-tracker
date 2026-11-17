import type { MoodSummary } from "../types.js";

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

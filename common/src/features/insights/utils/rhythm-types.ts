import type { Activity, ActivityGroup, Mood } from "../../catalog/types.js";
import type { InsightsDay } from "../types.js";

export interface RhythmActivityFrequency {
  activityDays: number;
  loggedDays: number;
  fraction: number | null;
}

export interface RhythmBucket {
  /** A stable machine-readable key: `mon` to `sun` or `01` to `12`. */
  key: string;
  label: string;
  year?: number;
  /** Number of distinct logged days in the bucket. */
  loggedCount: number;
  /** Number of logged days with a known mood. */
  count: number;
  mean: number | null;
  goodRate: number | null;
  distribution: Array<{ moodId: string; count: number }>;
  /** Selected activity incidence among logged days, never a raw count. */
  activityFrequency: RhythmActivityFrequency | null;
}

export interface RhythmYear {
  year: number;
  loggedCount: number;
  moodCount: number;
  mean: number | null;
  goodRate: number | null;
  weekdays: RhythmBucket[];
  months: RhythmBucket[];
}

export interface RhythmAnalysis {
  selectedYear: number | null;
  yearOptions: number[];
  loggedCount: number;
  moodCount: number;
  weekdays: RhythmBucket[];
  months: RhythmBucket[];
  years: RhythmYear[];
}

export interface RhythmAnalysisInput {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  startDate: string;
  endDate: string;
  /** `null` or `undefined` means all years. */
  year?: number | null;
  /** When omitted, the charts show only mood summaries. */
  activityId?: string | null;
}

export type WeekCohort = "higher" | "typical";

export interface QualifyingWeek {
  weekStart: string;
  weekEnd: string;
  label: string;
  loggedDays: number;
  moodCount: number;
  moodMean: number | null;
  goodRate: number | null;
  activityDays: Record<string, number>;
  activityFrequency: Record<string, number | null>;
  /** Mean number of distinct activities recorded per logged day. */
  activitySpread: number | null;
  distinctActivityCount: number;
  cohort: WeekCohort | null;
}

export interface WeekCohortSummary {
  cohort: WeekCohort;
  weekCount: number;
  moodMean: number | null;
  loggedDaysMean: number | null;
  activitySpreadMean: number | null;
}

export interface WeekActivityComparison {
  activityId: string;
  higherFrequency: number | null;
  typicalFrequency: number | null;
  difference: number | null;
  higherActivityDays: number;
  typicalActivityDays: number;
}

export interface BestWeeksAnalysis {
  minimumLoggedDays: number;
  /** Weekday range the weeks run over, for example "Monday–Sunday". */
  weekRange: string;
  qualifyingWeekCount: number;
  moodLoggedWeekCount: number;
  weeks: QualifyingWeek[];
  higherWeeks: QualifyingWeek[];
  typicalWeeks: QualifyingWeek[];
  unclassifiedWeeks: QualifyingWeek[];
  higher: WeekCohortSummary;
  typical: WeekCohortSummary;
  activityComparisons: WeekActivityComparison[];
  moodThreshold: number | null;
  cohortMethod: string;
}

export interface BestWeeksAnalysisInput {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Activity[];
  groups?: readonly ActivityGroup[];
  startDate: string;
  endDate: string;
  asOf: string;
  /** Four logged days keeps a week informative while allowing some gaps. */
  minimumLoggedDays?: number;
  /** JavaScript weekday (0 = Sunday) on which a week ends. Defaults to Sunday. */
  weekEndsOn?: number;
}

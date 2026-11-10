/**
 * The normalized backup that `scripts/daylio_import.py` makes from a Daylio
 * file and sends to `POST /api/import`.
 */

interface BackupMood {
  sourceId: string;
  name: string;
  score: number;
  emoji?: string | null;
}

interface BackupGroup {
  sourceId: string;
  name: string;
  sortOrder: number;
  archived?: boolean;
  sourceState?: number | null;
}

interface BackupActivity {
  sourceId: string;
  groupSourceId: string;
  name: string;
  sourceIconId?: string | null;
  sourceState?: number | null;
  sortOrder: number;
  archived?: boolean;
}

interface BackupGoal {
  sourceId: string;
  activitySourceId?: string | null;
  name: string;
  materialIcon?: string | null;
  repeatType?: "daily" | "weekly";
  scheduleType: "daily" | "weekdays" | "times_per_week";
  targetPerWeek?: number | null;
  weekdaysMask?: number | null;
  sortOrder: number;
  archived?: boolean;
  reminderEnabled?: boolean;
  reminderTime?: string | null;
  sourceState?: number | null;
}

interface BackupEntry {
  sourceId: string;
  logicalDate: string;
  localTime: string;
  timezoneOffsetMinutes?: number | null;
  moodSourceId: string;
  activitySourceIds: string[];
  legacyNoteTitle?: string | null;
  legacyNote?: string | null;
}

interface BackupCompletion {
  sourceId: string;
  goalSourceId: string;
  logicalDate: string;
  localTime?: string | null;
}

export interface DaylioBackup {
  sourceSystem: "daylio";
  sourceSha256?: string | null;
  csvSha256?: string | null;
  backupVersion?: unknown;
  moods: BackupMood[];
  groups: BackupGroup[];
  activities: BackupActivity[];
  goals: BackupGoal[];
  entries: BackupEntry[];
  completions: BackupCompletion[];
}

/** The IDs that the import gives to the records of a backup. */
export interface ImportIds {
  moods: ReadonlyMap<string, string>;
  activities: ReadonlyMap<string, string>;
  goals: ReadonlyMap<string, string>;
}

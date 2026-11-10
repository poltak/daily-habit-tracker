/**
 * The catalog that a new database of the old app starts with. The reset route
 * adds it back after it empties the tables, because the old app adds it to an
 * empty database on the first request. The catalog feature takes it over.
 */

type Row = readonly (string | number | null)[];

export interface SeedInsert {
  /** The SQL with one `?` for each value. */
  sql: string;
  rows: readonly Row[];
}

export const SEED_MOODS: SeedInsert = {
  sql: "insert or ignore into mood_levels (id, score, name, emoji, color, sort_order) values (?, ?, ?, ?, ?, ?)",
  rows: [
    ["mood-rad", 5, "Rad", "😄", "#ee8f6d", -5],
    ["mood-good", 4, "Good", "🙂", "#f4b85f", -4],
    ["mood-meh", 3, "Meh", "😐", "#9aa4ae", -3],
    ["mood-bad", 2, "Bad", "☹️", "#809bc5", -2],
    ["mood-awful", 1, "Awful", "😫", "#9b82b6", -1],
  ],
};

export const SEED_GROUPS: SeedInsert = {
  sql: "insert or ignore into activity_groups (id, name, sort_order) values (?, ?, ?)",
  rows: [
    ["group-health", "Health", 0],
    ["group-work", "Work", 1],
    ["group-home", "Home", 2],
    ["group-people", "People", 3],
    ["group-leisure", "Leisure", 4],
  ],
};

export const SEED_ACTIVITIES: SeedInsert = {
  sql: "insert or ignore into activities (id, group_id, name, material_icon, source_icon_id, sort_order) values (?, ?, ?, ?, ?, ?)",
  rows: [
    [
      "activity-gym",
      "group-health",
      "Gym",
      "fitness_center",
      "fitness_center",
      0,
    ],
    [
      "activity-walk",
      "group-health",
      "Walk",
      "directions_walk",
      "directions_walk",
      1,
    ],
    ["activity-sleep", "group-health", "Sleep", "bedtime", "bedtime", 2],
    [
      "activity-deep-work",
      "group-work",
      "Deep work",
      "laptop_mac",
      "laptop_mac",
      3,
    ],
    ["activity-meetings", "group-work", "Meetings", "groups", "groups", 4],
    ["activity-cook", "group-home", "Cook", "restaurant", "restaurant", 5],
    [
      "activity-chores",
      "group-home",
      "Chores",
      "cleaning_services",
      "cleaning_services",
      6,
    ],
    ["activity-family", "group-people", "Family", "favorite", "favorite", 7],
    [
      "activity-friends",
      "group-people",
      "Friends",
      "celebration",
      "celebration",
      8,
    ],
    [
      "activity-reading",
      "group-leisure",
      "Reading",
      "menu_book",
      "menu_book",
      9,
    ],
    [
      "activity-gaming",
      "group-leisure",
      "Gaming",
      "sports_esports",
      "sports_esports",
      10,
    ],
    [
      "activity-music",
      "group-leisure",
      "Music",
      "music_note",
      "music_note",
      11,
    ],
  ],
};

export const SEED_GOALS: SeedInsert = {
  sql: "insert or ignore into goals (id, activity_id, name, material_icon, repeat_type, schedule_type, target_per_week, weekdays_mask, sort_order, reminder_enabled) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  rows: [
    [
      "goal-move",
      "activity-gym",
      "Move your body",
      "fitness_center",
      "weekly",
      "times_per_week",
      3,
      null,
      0,
      0,
    ],
    [
      "goal-read",
      "activity-reading",
      "Read",
      "menu_book",
      "daily",
      "daily",
      null,
      127,
      1,
      0,
    ],
  ],
};

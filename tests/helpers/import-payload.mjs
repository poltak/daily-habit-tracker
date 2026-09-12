export function importPayload() {
  return {
    sourceSystem: "daylio",
    sourceSha256: "audit-fixture",
    moods: [{ sourceId: "m", name: "Good", score: 4 }],
    groups: [{ sourceId: "g", name: "Imported group", sortOrder: 0, archived: true }],
    activities: [{ sourceId: "a", groupSourceId: "g", name: "Walk", sourceIconId: null, sourceState: 0, sortOrder: 0, archived: true }],
    goals: [{ sourceId: "goal", activitySourceId: "a", name: "Walk daily", scheduleType: "daily", sortOrder: 0, archived: true, reminderEnabled: true, reminderTime: "20:00" }],
    entries: [{ sourceId: "e", logicalDate: "2020-01-01", localTime: "20:00", timezoneOffsetMinutes: null, moodSourceId: "m", activitySourceIds: ["a"], legacyNote: null }],
    completions: [{ sourceId: "c", goalSourceId: "goal", logicalDate: "2020-01-01", localTime: "20:00:00" }],
  };
}

import { addDays } from "@app/common/features/core/utils/logical-date";
import { type FullApplication } from "../../core/tests/full-application.js";

export function todayOf(app: FullApplication): string {
  return new Date(app.frontend.services.clock.now()).toISOString().slice(0, 10);
}

/** Save a day on the backend, as another device of the owner does. */
export function save(
  app: FullApplication,
  input: { logicalDate: string; moodId: string; activityIds?: string[] },
) {
  return app.backend.logic.days.saveEntry({
    logicalDate: input.logicalDate,
    input: {
      moodId: input.moodId,
      activityIds: input.activityIds ?? [],
      completedGoalIds: [],
    },
  });
}

/** Five days up to today: Gym on the good days, Cook on the bad ones. */
export async function saveFiveDays(app: FullApplication) {
  const today = todayOf(app);
  const days = [
    { back: 0, moodId: "mood-rad", activityIds: ["activity-gym"] },
    { back: 1, moodId: "mood-good", activityIds: ["activity-gym"] },
    { back: 2, moodId: "mood-meh", activityIds: ["activity-cook"] },
    {
      back: 3,
      moodId: "mood-good",
      activityIds: ["activity-gym", "activity-reading"],
    },
    { back: 4, moodId: "mood-bad", activityIds: ["activity-cook"] },
  ];
  for (const day of days) {
    await save(app, {
      logicalDate: addDays(today, -day.back),
      moodId: day.moodId,
      activityIds: day.activityIds,
    });
  }
  return today;
}

/** Save `count` days that end `endBack` days before today. */
export async function saveRun(
  app: FullApplication,
  input: { endBack: number; count: number; moodId: (back: number) => string },
) {
  const today = todayOf(app);
  for (let back = input.endBack; back < input.endBack + input.count; back++) {
    await save(app, {
      logicalDate: addDays(today, -back),
      moodId: input.moodId(back),
    });
  }
}

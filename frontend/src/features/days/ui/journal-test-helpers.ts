import { addDays } from "@app/common/features/core/utils/logical-date";
import type { FullApplication } from "../../core/tests/full-application.js";

/** The starting catalog is added by the first read of an empty catalog. */
export async function seedCatalog(app: FullApplication): Promise<void> {
  await app.backend.logic.catalog.read();
}

/** Today on the clock of the test device. */
export function todayOf(app: FullApplication): string {
  return new Date(app.frontend.services.clock.now()).toISOString().slice(0, 10);
}

export function daysAgo(app: FullApplication, days: number): string {
  return addDays(todayOf(app), -days);
}

/** Save a day on the backend, as another device of the owner does. */
export function saveOnAnotherDevice(
  app: FullApplication,
  input: {
    logicalDate: string;
    moodId: string;
    activityIds?: string[];
    expectedVersion?: number;
  },
) {
  return app.backend.logic.days.saveEntry({
    logicalDate: input.logicalDate,
    input: {
      moodId: input.moodId,
      activityIds: input.activityIds ?? [],
      completedGoalIds: [],
      ...(input.expectedVersion === undefined
        ? {}
        : { expectedVersion: input.expectedVersion }),
    },
  });
}

/** Save a whole day on the backend, as the agent of the owner does. Goals follow the activities. */
export function saveWholeDayOnAnotherDevice(
  app: FullApplication,
  input: { logicalDate: string; moodId: string; activityIds?: string[] },
) {
  return app.backend.logic.days.saveDay({
    logicalDate: input.logicalDate,
    input: { moodId: input.moodId, activityIds: input.activityIds ?? [] },
  });
}

/** The key under which the device keeps the draft of a day. */
export function draftKey(logicalDate: string): string {
  return `daymark:draft:v1:${logicalDate}`;
}

export const ACTIVE_DRAFT_DATE_KEY = "daymark:active-draft-date:v1";

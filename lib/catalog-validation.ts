import type { Activity, ActivityGroup, Goal } from "./daylio.ts";
import { isValidTime } from "./entry-validation.ts";

type CatalogPatches = {
  group: Partial<Pick<ActivityGroup, "name" | "sortOrder" | "archived">>;
  activity: Partial<Pick<Activity, "name" | "groupId" | "icon" | "sortOrder" | "archived">>;
  goal: Partial<Pick<Goal, "name" | "activityId" | "materialIcon" | "repeatType" | "scheduleType" | "targetPerWeek" | "weekdaysMask" | "sortOrder" | "archived" | "reminderEnabled" | "reminderTime">>;
};

const fields = {
  group: ["name", "sortOrder", "archived"],
  activity: ["name", "groupId", "icon", "sortOrder", "archived"],
  goal: ["name", "activityId", "materialIcon", "repeatType", "scheduleType", "targetPerWeek", "weekdaysMask", "sortOrder", "archived", "reminderEnabled", "reminderTime"],
};

export function validateCatalogPatch<K extends keyof CatalogPatches>({ kind, patch }: { kind: K; patch: unknown }): CatalogPatches[K] {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Catalog changes must be an object.");
  for (const [key, value] of Object.entries(patch)) {
    if (!fields[kind].includes(key)) throw new Error(`Unsupported ${kind} field: ${key}.`);
    if (value === undefined) continue;
    if (["archived", "reminderEnabled"].includes(key)) {
      if (typeof value !== "boolean") throw new Error(`${key} must be a boolean.`);
    } else if (["sortOrder", "targetPerWeek", "weekdaysMask"].includes(key)) {
      if (value === null && key !== "sortOrder") continue;
      if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${key} must be an integer.`);
    } else {
      if (key === "activityId" && value === null) continue;
      if (typeof value !== "string") throw new Error(`${key} must be a string.`);
      if ((key === "groupId" || key === "activityId") && !value.trim()) throw new Error(`${key} must be a non-empty string.`);
      if (key === "reminderTime" && value !== "" && !isValidTime(value)) throw new Error("Choose a valid reminder time.");
    }
  }
  return patch as CatalogPatches[K];
}

import type { Activity, ActivityGroup, Goal } from "./daylio.ts";
import { isValidTime } from "./entry-validation.ts";
import type { CatalogKind, SortOrderUpdate } from "./catalog-mutations.ts";

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

export function validateCatalogReorder(value: unknown): { kind: CatalogKind; updates: SortOrderUpdate[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Reorder must be an object.");
  const { kind, updates } = value as Record<string, unknown>;
  if (kind !== "group" && kind !== "activity" && kind !== "goal") throw new Error("Unsupported catalog item.");
  if (!Array.isArray(updates) || !updates.length) throw new Error("Choose items to reorder.");
  const ids = new Set<string>();
  for (const update of updates) {
    if (!update || typeof update !== "object" || Array.isArray(update)) throw new Error("Invalid reorder item.");
    if (typeof update.id !== "string" || !update.id.trim() || ids.has(update.id)) throw new Error("Reorder item IDs must be unique non-empty strings.");
    if (!Number.isSafeInteger(update.sortOrder) || !Number.isSafeInteger(update.expectedSortOrder)) throw new Error("Sort values must be integers.");
    ids.add(update.id);
  }
  return { kind, updates };
}

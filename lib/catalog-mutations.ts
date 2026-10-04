export type CatalogKind = "group" | "activity" | "goal";
export type CatalogOverride = Record<string, unknown>;
export type CatalogOverrides = Record<string, CatalogOverride>;
export type SortableCatalogItem = { id: string; sortOrder: number };
export type SortOrderUpdate = { id: string; sortOrder: number; expectedSortOrder: number };

export function catalogKey({ kind, id }: { kind: CatalogKind; id: string }) {
  return `${kind}:${id}`;
}

/** The text of the alert that a person must accept before a catalog item is deleted. `activityCount` is the number of activities in a group. */
export function deleteWarning({ kind, name, activityCount = 0 }: { kind: CatalogKind; name: string; activityCount?: number }) {
  if (kind === "goal") return `Delete the goal “${name}”?\n\nThis also deletes all of its completion history. You cannot recover a deleted goal. To hide the goal and keep its history, archive it instead.`;
  if (kind === "activity") return `Delete the activity “${name}”?\n\nThis also removes it from each day on which it is recorded. A goal linked to it stays, without an associated activity. You cannot recover a deleted activity. To hide the activity and keep its history, archive it instead.`;
  if (!activityCount) return `Delete the activity group “${name}”?\n\nYou cannot recover a deleted group.`;
  const activities = activityCount === 1 ? "its 1 activity" : `its ${activityCount} activities`;
  return `Delete the activity group “${name}”?\n\nThis also deletes ${activities} and removes ${activityCount === 1 ? "it" : "them"} from each day on which ${activityCount === 1 ? "it is" : "they are"} recorded. A goal linked to a deleted activity stays, without an associated activity. You cannot recover a deleted group or its activities. To hide the group and keep its history, archive it instead.`;
}

export function acquirePendingAction({ pending, key }: { pending: Set<string>; key: string }) {
  if (pending.has(key)) return false;
  pending.add(key);
  return true;
}

export function releasePendingAction({ pending, key }: { pending: Set<string>; key: string }) {
  pending.delete(key);
}

export function applyCatalogOverride({ overrides, key, patch }: { overrides: CatalogOverrides; key: string; patch: CatalogOverride }) {
  return { ...overrides, [key]: { ...overrides[key], ...patch } };
}

export function rollbackCatalogOverride({ overrides, key, previous }: { overrides: CatalogOverrides; key: string; previous?: CatalogOverride }) {
  if (previous) return { ...overrides, [key]: previous };
  const next = { ...overrides };
  delete next[key];
  return next;
}

export function mergeCatalogOverride<T extends object>({ record, overrides, key }: { record: T; overrides: CatalogOverrides; key: string }) {
  const patch = overrides[key];
  return patch ? ({ ...record, ...patch } as T) : record;
}

export function catalogOverrideMatches<T extends object>({ record, patch }: { record: T; patch: CatalogOverride }) {
  return Object.entries(patch).every(([key, value]) => (record as Record<string, unknown>)[key] === value);
}

export function commitCatalogOverride<T extends object>({ overrides, key, record, patch }: { overrides: CatalogOverrides; key: string; record: T; patch: CatalogOverride }) {
  if (!catalogOverrideMatches({ record, patch })) return overrides;
  const next = { ...overrides };
  delete next[key];
  return next;
}

export function sortCatalogItems<T extends SortableCatalogItem>({ items }: { items: readonly T[] }) {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getReorderPlan({ items, itemId, direction }: { items: readonly SortableCatalogItem[]; itemId: string; direction: -1 | 1 }) {
  const ordered = sortCatalogItems({ items });
  const itemIndex = ordered.findIndex((item) => item.id === itemId);
  const item = ordered[itemIndex];
  const swap = ordered[itemIndex + direction];
  if (!item || !swap) return null;

  const hasTies = new Set(ordered.map((record) => record.sortOrder)).size !== ordered.length;
  if (hasTies) {
    [ordered[itemIndex], ordered[itemIndex + direction]] = [swap, item];
    return { updates: ordered.map((record, sortOrder) => ({ id: record.id, sortOrder, expectedSortOrder: record.sortOrder })) };
  }
  return { updates: [
    { id: item.id, sortOrder: swap.sortOrder, expectedSortOrder: item.sortOrder },
    { id: swap.id, sortOrder: item.sortOrder, expectedSortOrder: swap.sortOrder },
  ] satisfies SortOrderUpdate[] };
}

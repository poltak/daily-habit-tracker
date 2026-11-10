import type {
  CatalogKind,
  SortOrderUpdate,
} from "@app/common/features/catalog/types";

export type CatalogOverride = Record<string, unknown>;
export type CatalogOverrides = Record<string, CatalogOverride>;

interface SortableCatalogItem {
  id: string;
  sortOrder: number;
}

export function catalogKey({
  kind,
  id,
}: {
  kind: CatalogKind;
  id: string;
}): string {
  return `${kind}:${id}`;
}

/** The key that stands for the change of one item while it runs. */
export function actionKey({
  kind,
  id,
}: {
  kind: CatalogKind;
  id: string;
}): string {
  return `catalog:${kind}:${id}`;
}

export function reorderKey(kind: CatalogKind): string {
  return `reorder:${kind}`;
}

/**
 * The text that the owner must accept before an item is deleted.
 * `activityCount` is the number of activities in a group.
 */
export function deleteWarning({
  kind,
  name,
  activityCount = 0,
}: {
  kind: CatalogKind;
  name: string;
  activityCount?: number;
}): string {
  if (kind === "goal") {
    return `Delete the goal “${name}”?\n\nThis also deletes all of its completion history. You cannot recover a deleted goal. To hide the goal and keep its history, archive it instead.`;
  }
  if (kind === "activity") {
    return `Delete the activity “${name}”?\n\nThis also removes it from each day on which it is recorded. A goal linked to it stays, without an associated activity. You cannot recover a deleted activity. To hide the activity and keep its history, archive it instead.`;
  }
  if (!activityCount) {
    return `Delete the activity group “${name}”?\n\nYou cannot recover a deleted group.`;
  }
  const one = activityCount === 1;
  const activities = one ? "its 1 activity" : `its ${activityCount} activities`;
  return `Delete the activity group “${name}”?\n\nThis also deletes ${activities} and removes ${one ? "it" : "them"} from each day on which ${one ? "it is" : "they are"} recorded. A goal linked to a deleted activity stays, without an associated activity. You cannot recover a deleted group or its activities. To hide the group and keep its history, archive it instead.`;
}

export function applyCatalogOverride({
  overrides,
  key,
  patch,
}: {
  overrides: CatalogOverrides;
  key: string;
  patch: CatalogOverride;
}): CatalogOverrides {
  return { ...overrides, [key]: { ...overrides[key], ...patch } };
}

export function rollbackCatalogOverride({
  overrides,
  key,
  previous,
}: {
  overrides: CatalogOverrides;
  key: string;
  previous?: CatalogOverride | undefined;
}): CatalogOverrides {
  if (previous) {
    return { ...overrides, [key]: previous };
  }
  const next = { ...overrides };
  delete next[key];
  return next;
}

export function mergeCatalogOverride<Item extends object>({
  record,
  overrides,
  key,
}: {
  record: Item;
  overrides: CatalogOverrides;
  key: string;
}): Item {
  const patch = overrides[key];
  return patch ? { ...record, ...patch } : record;
}

/** Drop the changes that the server now shows. A change it does not show yet stays. */
export function commitCatalogOverrides({
  overrides,
  records,
}: {
  overrides: CatalogOverrides;
  /** Every item of the catalog by its key. */
  records: ReadonlyMap<string, object>;
}): CatalogOverrides {
  const next = { ...overrides };
  for (const [key, patch] of Object.entries(overrides)) {
    const record = records.get(key) as Record<string, unknown> | undefined;
    if (
      record &&
      Object.entries(patch).every(([field, value]) => record[field] === value)
    ) {
      delete next[key];
    }
  }
  return next;
}

export function sortCatalogItems<Item extends SortableCatalogItem>(
  items: readonly Item[],
): Item[] {
  return items.toSorted((left, right) => left.sortOrder - right.sortOrder);
}

/**
 * The sort values that move one item a step. Items with equal sort values get
 * a fresh order first, so that the step shows.
 */
export function getReorderPlan({
  items,
  itemId,
  direction,
}: {
  items: readonly SortableCatalogItem[];
  itemId: string;
  direction: -1 | 1;
}): { updates: SortOrderUpdate[] } | null {
  const ordered = sortCatalogItems(items);
  const itemIndex = ordered.findIndex((item) => item.id === itemId);
  const item = ordered[itemIndex];
  const swap = ordered[itemIndex + direction];
  if (!item || !swap) {
    return null;
  }
  const hasTies =
    new Set(ordered.map((record) => record.sortOrder)).size !== ordered.length;
  if (hasTies) {
    [ordered[itemIndex], ordered[itemIndex + direction]] = [swap, item];
    return {
      updates: ordered.map((record, sortOrder) => ({
        id: record.id,
        sortOrder,
        expectedSortOrder: record.sortOrder,
      })),
    };
  }
  return {
    updates: [
      {
        id: item.id,
        sortOrder: swap.sortOrder,
        expectedSortOrder: item.sortOrder,
      },
      {
        id: swap.id,
        sortOrder: item.sortOrder,
        expectedSortOrder: swap.sortOrder,
      },
    ],
  };
}

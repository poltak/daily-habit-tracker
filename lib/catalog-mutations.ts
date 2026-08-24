export type CatalogKind = "group" | "activity" | "goal";
export type CatalogOverride = Record<string, unknown>;
export type CatalogOverrides = Record<string, CatalogOverride>;
export type SortableCatalogItem = { id: string; sortOrder: number };
export type SortOrderUpdate = { id: string; sortOrder: number };

export function catalogKey({ kind, id }: { kind: CatalogKind; id: string }) {
  return `${kind}:${id}`;
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
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => left.item.sortOrder - right.item.sortOrder || left.index - right.index)
    .map(({ item }) => item);
}

export function getReorderPlan({ items, itemId, direction }: { items: readonly SortableCatalogItem[]; itemId: string; direction: -1 | 1 }) {
  const ordered = sortCatalogItems({ items });
  const itemIndex = ordered.findIndex((item) => item.id === itemId);
  const item = ordered[itemIndex];
  const swap = ordered[itemIndex + direction];
  if (!item || !swap) return null;

  return {
    item,
    swap,
    updates: [
      { id: item.id, sortOrder: swap.sortOrder },
      { id: swap.id, sortOrder: item.sortOrder },
    ] satisfies SortOrderUpdate[],
    compensation: [
      { id: item.id, sortOrder: item.sortOrder },
      { id: swap.id, sortOrder: swap.sortOrder },
    ] satisfies SortOrderUpdate[],
  };
}

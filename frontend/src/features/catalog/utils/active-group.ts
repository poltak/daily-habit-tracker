import type { ActivityGroup } from "@app/common/features/catalog/types";

/**
 * The ID of the requested group when it is active. If not, the ID of the first
 * active group, or "" when there is none.
 */
export function resolveActiveGroupId({
  groups,
  requestedId,
}: {
  groups: readonly ActivityGroup[];
  requestedId?: string | undefined;
}): string {
  return (
    groups.find((group) => group.id === requestedId && !group.archived)?.id ??
    groups.find((group) => !group.archived)?.id ??
    ""
  );
}

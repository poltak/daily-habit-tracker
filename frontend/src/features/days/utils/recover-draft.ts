import type { DayState } from "@app/common/features/days/types";
import type { DaysStorage } from "../storage/days-storage.js";
import { draftForOpenedDay, withKnownCatalog } from "./draft.js";

/**
 * The draft that the form of an opened day starts with: the day of the
 * server, with the draft from this device on top when it fits the saved
 * version. A draft for another version is deleted.
 */
export function recoverDraft({
  storage,
  logicalDate,
  state,
  catalog,
}: {
  storage: DaysStorage;
  logicalDate: string;
  state: DayState;
  catalog: { knownActivityIds(): Set<string>; knownGoalIds(): Set<string> };
}) {
  const stored = storage.readDraft({ logicalDate });
  const matches =
    stored !== null && (stored.version ?? 0) === (state.entry?.version ?? 0);
  if (stored && !matches) {
    storage.clearDraft({ logicalDate });
  }
  const opened = draftForOpenedDay({
    state,
    recovered: matches ? stored : null,
  });
  // A draft from this device can name an activity that was deleted since.
  return {
    restored: opened.restored,
    draft: withKnownCatalog({
      record: opened.draft,
      activityIds: catalog.knownActivityIds(),
      goalIds: catalog.knownGoalIds(),
    }),
  };
}

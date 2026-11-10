import { isLogicalDate } from "@app/common/features/core/utils/logical-date";
import type { BrowserKeyValueStore } from "../../core/storage/types.js";
import type { Draft } from "../utils/draft.js";

/** Same keys as the old app, so a draft survives the move. */
const DRAFT_PREFIX = "daymark:draft:v1:";
const ACTIVE_DRAFT_DATE_KEY = "daymark:active-draft-date:v1";
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

interface DaysStorageProps {
  store: BrowserKeyValueStore;
}

interface StoredDraft {
  logicalDate: string;
  draft: Draft;
  savedAt: string;
}

function isIdList(list: unknown): boolean {
  return Array.isArray(list) && list.every((id) => typeof id === "string");
}

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<Draft>;
  return (
    typeof candidate.moodId === "string" &&
    isIdList(candidate.activityIds) &&
    isIdList(candidate.completedGoalIds) &&
    typeof candidate.localTime === "string" &&
    LOCAL_TIME.test(candidate.localTime) &&
    (candidate.version === undefined ||
      (Number.isSafeInteger(candidate.version) && candidate.version > 0))
  );
}

/**
 * The choices of a day that this device keeps until the server has them. A
 * browser that blocks its storage, or has no room, loses the draft only: the
 * server stays the source of truth.
 */
export class DaysStorage {
  constructor(private readonly deps: DaysStorageProps) {}

  readDraft({ logicalDate }: { logicalDate: string }): Draft | null {
    return this.readStored({ logicalDate })?.draft ?? null;
  }

  writeDraft({
    logicalDate,
    draft,
    savedAt,
  }: {
    logicalDate: string;
    draft: Draft;
    savedAt: string;
  }): void {
    try {
      const stored: StoredDraft = { logicalDate, draft, savedAt };
      this.deps.store.setItem(
        `${DRAFT_PREFIX}${logicalDate}`,
        JSON.stringify(stored),
      );
      this.rememberDate({ logicalDate });
    } catch {
      // Draft recovery is best effort when storage is unavailable or full.
    }
  }

  /** Keep the copy of a draft when `keep` is true, and drop it otherwise. */
  settleDraft({
    keep,
    ...draft
  }: {
    logicalDate: string;
    draft: Draft;
    savedAt: string;
    keep: boolean;
  }): void {
    if (keep) {
      this.writeDraft(draft);
    } else {
      this.clearDraft(draft);
    }
  }

  clearDraft({ logicalDate }: { logicalDate: string }): void {
    try {
      this.deps.store.removeItem(`${DRAFT_PREFIX}${logicalDate}`);
      if (this.deps.store.getItem(ACTIVE_DRAFT_DATE_KEY) === logicalDate) {
        this.deps.store.removeItem(ACTIVE_DRAFT_DATE_KEY);
      }
    } catch {
      // The server stays the source of truth.
    }
  }

  /** The last day that the owner worked on, which opens first the next time. */
  rememberDate({ logicalDate }: { logicalDate: string }): void {
    try {
      this.deps.store.setItem(ACTIVE_DRAFT_DATE_KEY, logicalDate);
    } catch {
      // As above.
    }
  }

  readRememberedDate(): string | null {
    try {
      const logicalDate = this.deps.store.getItem(ACTIVE_DRAFT_DATE_KEY);
      return logicalDate && this.readStored({ logicalDate })
        ? logicalDate
        : null;
    } catch {
      return null;
    }
  }

  private readStored({
    logicalDate,
  }: {
    logicalDate: string;
  }): StoredDraft | null {
    if (!isLogicalDate(logicalDate)) {
      return null;
    }
    try {
      const raw = this.deps.store.getItem(`${DRAFT_PREFIX}${logicalDate}`);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<StoredDraft>;
      if (
        parsed.logicalDate !== logicalDate ||
        typeof parsed.savedAt !== "string" ||
        !isDraft(parsed.draft)
      ) {
        return null;
      }
      return { logicalDate, draft: parsed.draft, savedAt: parsed.savedAt };
    } catch {
      return null;
    }
  }
}

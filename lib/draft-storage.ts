import type { Entry } from "./daylio";

export type Draft = {
  moodId: string;
  activityIds: string[];
  completedGoalIds: string[];
  localTime: string;
  version?: number;
};

export type StoredDraft = {
  logicalDate: string;
  draft: Draft;
  savedAt: string;
};

const STORAGE_PREFIX = "daymark:draft:v1:";
const ACTIVE_DRAFT_DATE_KEY = "daymark:active-draft-date:v1";

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(logicalDate: string) {
  return `${STORAGE_PREFIX}${logicalDate}`;
}

export function rememberDraftDate(logicalDate: string) {
  const currentStorage = storage();
  if (!currentStorage) return;
  try {
    currentStorage.setItem(ACTIVE_DRAFT_DATE_KEY, logicalDate);
  } catch {
    // Draft recovery remains best effort when storage is unavailable or full.
  }
}

export function readActiveStoredDraft() {
  const currentStorage = storage();
  if (!currentStorage) return null;
  try {
    const logicalDate = currentStorage.getItem(ACTIVE_DRAFT_DATE_KEY);
    return logicalDate ? readStoredDraft(logicalDate) : null;
  } catch {
    return null;
  }
}

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Draft>;
  return typeof candidate.moodId === "string"
    && Array.isArray(candidate.activityIds) && candidate.activityIds.every((id) => typeof id === "string")
    && Array.isArray(candidate.completedGoalIds) && candidate.completedGoalIds.every((id) => typeof id === "string")
    && typeof candidate.localTime === "string"
    && (candidate.version === undefined || typeof candidate.version === "number");
}

export function readStoredDraft(logicalDate: string): StoredDraft | null {
  const currentStorage = storage();
  if (!currentStorage) return null;
  try {
    const raw = currentStorage.getItem(storageKey(logicalDate));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (parsed.logicalDate !== logicalDate || typeof parsed.savedAt !== "string" || !isDraft(parsed.draft)) return null;
    return { logicalDate, draft: parsed.draft, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function writeStoredDraft(logicalDate: string, draft: Draft) {
  const currentStorage = storage();
  if (!currentStorage) return;
  try {
    rememberDraftDate(logicalDate);
    currentStorage.setItem(storageKey(logicalDate), JSON.stringify({ logicalDate, draft, savedAt: new Date().toISOString() } satisfies StoredDraft));
  } catch {
    // Draft recovery is best effort when storage is unavailable or full.
  }
}

export function clearStoredDraft(logicalDate: string) {
  const currentStorage = storage();
  if (!currentStorage) return;
  try {
    currentStorage.removeItem(storageKey(logicalDate));
    if (currentStorage.getItem(ACTIVE_DRAFT_DATE_KEY) === logicalDate) currentStorage.removeItem(ACTIVE_DRAFT_DATE_KEY);
  } catch {
    // Ignore storage cleanup failures; the server remains authoritative.
  }
}

export function draftMatchesServerVersion(stored: StoredDraft, serverEntry: Entry | null) {
  return (stored.draft.version ?? 0) === (serverEntry?.version ?? 0);
}

export function recoverStoredDraft(logicalDate: string, serverEntry: Entry | null) {
  const stored = readStoredDraft(logicalDate);
  if (stored && draftMatchesServerVersion(stored, serverEntry)) return stored.draft;
  if (stored) clearStoredDraft(logicalDate);
  return null;
}

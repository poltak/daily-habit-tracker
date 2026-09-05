import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

const { clearStoredDraft, draftMatchesServerVersion, readActiveStoredDraft, readStoredDraft, recoverStoredDraft, rememberDraftDate, writeStoredDraft } = await import("../lib/draft-storage.ts");

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else delete globalThis.window;
});

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const entry = { version: 3 };
const draft = { moodId: "mood-good", activityIds: ["activity-walk"], completedGoalIds: [], localTime: "21:00", version: 3 };

test("draft storage round-trips a logical-date draft and clears it", () => {
  globalThis.window = { localStorage: createStorage() };
  writeStoredDraft("2026-07-31", draft);
  const stored = readStoredDraft("2026-07-31");
  assert.deepEqual(stored?.draft, draft);
  assert.equal(stored?.logicalDate, "2026-07-31");
  assert.equal(typeof stored?.savedAt, "string");
  assert.deepEqual(readActiveStoredDraft()?.draft, draft);
  clearStoredDraft("2026-07-31");
  assert.equal(readStoredDraft("2026-07-31"), null);
  assert.equal(readActiveStoredDraft(), null);
});

test("draft recovery only applies to the server version it was based on", () => {
  globalThis.window = { localStorage: createStorage() };
  writeStoredDraft("2026-07-31", draft);
  const stored = readStoredDraft("2026-07-31");
  assert.ok(stored);
  assert.equal(draftMatchesServerVersion(stored, entry), true);
  assert.equal(draftMatchesServerVersion(stored, { version: 4 }), false);
  assert.deepEqual(recoverStoredDraft("2026-07-31", entry), draft);
  assert.equal(draftMatchesServerVersion({ ...stored, draft: { ...stored.draft, version: undefined } }, null), true);
  assert.equal(recoverStoredDraft("2026-07-31", { version: 4 }), null);
  writeStoredDraft("2026-07-31", draft);
  rememberDraftDate("2026-07-31");
  assert.equal(readActiveStoredDraft()?.logicalDate, "2026-07-31");
});

test("malformed drafts are ignored", () => {
  const localStorage = createStorage();
  globalThis.window = { localStorage };
  localStorage.setItem("daymark:draft:v1:2026-07-31", JSON.stringify({ logicalDate: "2026-07-31", draft: { moodId: 42 } }));
  assert.equal(readStoredDraft("2026-07-31"), null);
});

test("a failed draft write preserves the last recoverable active draft", () => {
  const localStorage = createStorage();
  globalThis.window = { localStorage };
  writeStoredDraft("2026-07-31", draft);

  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === "daymark:draft:v1:2026-08-01") throw new Error("Storage quota exceeded.");
    setItem(key, value);
  };

  assert.doesNotThrow(() => writeStoredDraft("2026-08-01", { ...draft, localTime: "22:00" }));
  assert.equal(readStoredDraft("2026-08-01"), null);
  assert.equal(readActiveStoredDraft()?.logicalDate, "2026-07-31");
  assert.deepEqual(readActiveStoredDraft()?.draft, draft);
});

test("draft writes remain recoverable if the active-date pointer cannot be saved", () => {
  const localStorage = createStorage();
  globalThis.window = { localStorage };
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === "daymark:active-draft-date:v1") throw new Error("Storage unavailable.");
    setItem(key, value);
  };

  assert.doesNotThrow(() => writeStoredDraft("2026-07-31", draft));
  assert.deepEqual(recoverStoredDraft("2026-07-31", entry), draft);
});

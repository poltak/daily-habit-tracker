import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { MOODS } = await import("../lib/daylio.ts");

test("built-in moods use the canonical Daymark faces", () => {
  assert.deepEqual(Object.fromEntries(MOODS.map((mood) => [mood.id, mood.emoji])), {
    "mood-rad": "😄",
    "mood-good": "🙂",
    "mood-meh": "😐",
    "mood-bad": "☹️",
    "mood-awful": "😫",
  });
  assert.deepEqual(MOODS.map((mood) => [mood.id, [...mood.emoji].map((character) => character.codePointAt(0))]), [
    ["mood-rad", [0x1f604]],
    ["mood-good", [0x1f642]],
    ["mood-meh", [0x1f610]],
    ["mood-bad", [0x2639, 0xfe0f]],
    ["mood-awful", [0x1f62b]],
  ]);
});

test("mood emoji migration is scoped and registered", async () => {
  const migration = await readFile(new URL("../drizzle/0006_correct_standard_mood_emojis.sql", import.meta.url), "utf8");
  const journal = await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");
  assert.match(migration, /UPDATE `mood_levels`\s+SET `emoji` = CASE `id`/);
  for (const [id, emoji] of Object.entries({
    "mood-rad": "😄",
    "mood-good": "🙂",
    "mood-meh": "😐",
    "mood-bad": "☹️",
    "mood-awful": "😫",
  })) {
    assert.match(migration, new RegExp(`WHEN '${id}' THEN '${emoji}'`));
  }
  assert.match(migration, /WHERE `id` IN \('mood-rad', 'mood-good', 'mood-meh', 'mood-bad', 'mood-awful'\)/);
  assert.match(journal, /0006_correct_standard_mood_emojis/);
});

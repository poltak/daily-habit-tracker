import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DaylioMemoryStore } from "../../lib/daylio.ts";

// Execute the store's real SQL, including transaction rollback, without a server.
export function createTestDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../../drizzle/", import.meta.url);
  sqlite.exec("BEGIN");
  for (const file of readdirSync(migrations).filter((file) => file.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  }
  sqlite.exec("COMMIT");
  const seed = new DaylioMemoryStore().bootstrap();
  for (const mood of seed.moods) sqlite.prepare("INSERT INTO mood_levels (id, score, name, emoji, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)").run(mood.id, mood.score, mood.name, mood.emoji, mood.color, -mood.score);
  for (const group of seed.groups) sqlite.prepare("INSERT INTO activity_groups (id, name, sort_order) VALUES (?, ?, ?)").run(group.id, group.name, group.sortOrder);
  for (const activity of seed.activities) sqlite.prepare("INSERT INTO activities (id, group_id, name, material_icon, sort_order) VALUES (?, ?, ?, ?, ?)").run(activity.id, activity.groupId, activity.name, activity.icon, activity.sortOrder);
  for (const goal of seed.goals) sqlite.prepare("INSERT INTO goals (id, activity_id, name, material_icon, repeat_type, schedule_type, target_per_week, weekdays_mask, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(goal.id, goal.activityId, goal.name, goal.materialIcon, goal.repeatType, goal.scheduleType, goal.targetPerWeek ?? null, goal.weekdaysMask ?? null, goal.sortOrder);
  const queries = [];
  const batches = [];
  let beforeBatch;
  function prepare(query, values = []) {
    const execute = () => {
      const statement = sqlite.prepare(query);
      const results = statement.all(...values).map((row) => ({ ...row }));
      const changes = sqlite.prepare("SELECT changes() AS count").get().count;
      queries.push({ query, values, rows: results.length });
      return { success: true, results, meta: { changes } };
    };
    return {
      bind: (...bindings) => prepare(query, bindings),
      all: async () => execute(),
      first: async () => execute().results[0] ?? null,
      run: async () => execute(),
      execute,
    };
  }
  return {
    sqlite,
    queries,
    batches,
    prepare,
    setBeforeBatch(callback) { beforeBatch = callback; },
    async batch(statements) {
      batches.push(statements.length);
      const callback = beforeBatch;
      beforeBatch = undefined;
      if (callback) await callback();
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

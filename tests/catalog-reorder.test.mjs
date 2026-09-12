import assert from "node:assert/strict";
import test from "node:test";
import { DaylioMemoryStore } from "../lib/daylio.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { getReorderPlan } from "../lib/catalog-mutations.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

for (const kind of ["memory", "D1"]) {
  test(`${kind} reorders tied values and rejects a stale move without partial changes`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const groups = (await store.bootstrap()).groups;
    for (const group of groups) await store.updateGroup(group.id, { sortOrder: 0 });
    const items = (await store.bootstrap()).groups;
    const plan = getReorderPlan({ items, itemId: items[0].id, direction: 1 });
    await store.reorderCatalog({ kind: "group", updates: plan.updates });
    const moved = (await store.bootstrap()).groups;
    assert.deepEqual(moved.map((group) => group.id), [items[1].id, items[0].id, ...items.slice(2).map((group) => group.id)]);
    const stale = getReorderPlan({ items: moved, itemId: items[0].id, direction: -1 });
    // The second item conflicts: the first update must roll back too.
    await store.updateGroup(stale.updates[1].id, { sortOrder: 99 });
    const before = (await store.bootstrap()).groups;
    await assert.rejects(async () => store.reorderCatalog({ kind: "group", updates: stale.updates }), (error) => error.code === "VERSION_CONFLICT");
    assert.deepEqual((await store.bootstrap()).groups, before);
    for (const updates of [[], [{ id: "missing", sortOrder: 1, expectedSortOrder: 0 }], [{ id: items[0].id, sortOrder: "1", expectedSortOrder: 0 }]]) {
      await assert.rejects(async () => store.reorderCatalog({ kind: "group", updates }));
      assert.deepEqual((await store.bootstrap()).groups, before);
    }
  });
}

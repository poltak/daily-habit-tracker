import assert from "node:assert/strict";
import test from "node:test";

const {
  acquirePendingAction,
  applyCatalogOverride,
  catalogOverrideMatches,
  commitCatalogOverride,
  getReorderPlan,
  mergeCatalogOverride,
  releasePendingAction,
  rollbackCatalogOverride,
  sortCatalogItems,
} = await import("../lib/catalog-mutations.ts");

test("pending action acquisition suppresses duplicate same-key work synchronously", () => {
  const pending = new Set();
  assert.equal(acquirePendingAction({ pending, key: "catalog:group:one" }), true);
  assert.equal(acquirePendingAction({ pending, key: "catalog:group:one" }), false);
  assert.equal(acquirePendingAction({ pending, key: "catalog:group:two" }), true);
  releasePendingAction({ pending, key: "catalog:group:one" });
  assert.equal(acquirePendingAction({ pending, key: "catalog:group:one" }), true);
});

test("catalog optimistic overrides apply, roll back, and commit only after server reconciliation", () => {
  const key = "activity:one";
  const base = { [key]: { archived: false, name: "Read" } };
  const applied = applyCatalogOverride({ overrides: base, key, patch: { archived: true } });
  assert.deepEqual(mergeCatalogOverride({ record: { id: "one", archived: false, name: "Read" }, overrides: applied, key }), { id: "one", archived: true, name: "Read" });
  assert.deepEqual(rollbackCatalogOverride({ overrides: applied, key, previous: base[key] }), base);
  assert.equal(catalogOverrideMatches({ record: { id: "one", archived: true, name: "Read" }, patch: { archived: true } }), true);
  assert.deepEqual(commitCatalogOverride({ overrides: applied, key, record: { id: "one", archived: false }, patch: { archived: true } }), applied);
  assert.deepEqual(commitCatalogOverride({ overrides: applied, key, record: { id: "one", archived: true }, patch: { archived: true } }), {});
});

test("reorder plan supplies inverse updates for partial-write compensation", () => {
  const plan = getReorderPlan({
    items: [
      { id: "first", sortOrder: 1 },
      { id: "second", sortOrder: 2 },
      { id: "third", sortOrder: 3 },
    ],
    itemId: "second",
    direction: -1,
  });
  assert.deepEqual(plan?.updates, [
    { id: "second", sortOrder: 1 },
    { id: "first", sortOrder: 2 },
  ]);
  assert.deepEqual(plan?.compensation, [
    { id: "second", sortOrder: 2 },
    { id: "first", sortOrder: 1 },
  ]);
  assert.deepEqual(plan?.compensation.filter((update) => update.id === "second"), [{ id: "second", sortOrder: 2 }]);
  assert.equal(getReorderPlan({ items: [{ id: "only", sortOrder: 1 }], itemId: "only", direction: 1 }), null);
});

test("optimistic catalog sorting uses sortOrder and keeps stable ties", () => {
  assert.deepEqual(sortCatalogItems({
    items: [
      { id: "third", sortOrder: 3 },
      { id: "first-a", sortOrder: 1 },
      { id: "first-b", sortOrder: 1 },
      { id: "second", sortOrder: 2 },
    ],
  }).map((item) => item.id), ["first-a", "first-b", "second", "third"]);
});

import assert from "node:assert/strict";
import test from "node:test";

const { createLatestRequestGate } = await import("../lib/latest-request-gate.ts");

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

test("only the latest deferred date response can apply", async () => {
  const gate = createLatestRequestGate();
  const older = gate.begin();
  const olderResponse = deferred();
  const newer = gate.begin();
  const newerResponse = deferred();

  olderResponse.resolve("older date");
  newerResponse.resolve("newer date");
  const responses = await Promise.all([olderResponse.promise, newerResponse.promise]);
  const applied = [older, newer].flatMap((request, index) => request.isCurrent() ? [responses[index]] : []);

  assert.equal(older.signal.aborted, true);
  assert.deepEqual(applied, ["newer date"]);
});

test("cancelling a gate invalidates the active request", () => {
  const gate = createLatestRequestGate();
  const request = gate.begin();

  gate.cancel();

  assert.equal(request.signal.aborted, true);
  assert.equal(request.isCurrent(), false);
});

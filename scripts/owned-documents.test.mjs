import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PATHS_FILE, matchesPath } from "./template-files.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
// A project keeps these three the same as the template, also when
// `templateOwned` does not list them.
const REFERENCE_DOCUMENTS = [
  "docs/agents/README.md",
  "docs/agents/decisions.md",
  "docs/agents/setup.md",
];

const trackedFiles = () =>
  execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

test("no owned document names a file of the example", async () => {
  const { example, templateOwned, withExample } = JSON.parse(
    await readFile(path.join(repoRoot, PATHS_FILE), "utf8"),
  );
  const owned = [...templateOwned, ...REFERENCE_DOCUMENTS];
  const files = trackedFiles();
  const documents = files.filter(
    (file) =>
      file.endsWith(".md") &&
      owned.some((entry) => matchesPath({ entry, file })),
  );
  const exampleFiles = files.filter((file) =>
    [...example, ...withExample]
      .filter((entry) => !entry.startsWith(".agents/"))
      .filter((entry) => !entry.startsWith(".claude/"))
      .some((entry) => matchesPath({ entry, file })),
  );
  const names = [
    ...example.map((entry) => entry.replace(/^.*?\/src\//, "")),
    ...exampleFiles.map((file) => path.posix.basename(file)),
  ].filter((name) => name !== "README.md" && name !== "types.ts");

  assert.ok(documents.includes("AGENTS.md"));
  assert.ok(documents.includes("docs/agents/testing.md"));
  assert.ok(names.includes("features/notes/"));
  assert.ok(names.includes("notes-logic.test.ts"));
  const found = [];
  for (const document of documents) {
    const text = await readFile(path.join(repoRoot, document), "utf8");
    for (const name of names) {
      if (text.includes(name)) {
        found.push(`${document}: ${name}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

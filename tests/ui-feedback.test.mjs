import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const setupSource = await readFile(new URL("../app/components/setup-view.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("the save panel is a static section of the recording form", () => {
  const saveRule = stylesSource.match(/\.save-bar\s*\{[^}]+\}/)?.[0] ?? "";
  assert.match(saveRule, /margin-top/);
  assert.doesNotMatch(saveRule, /position\s*:\s*(?:sticky|fixed)/);
  assert.doesNotMatch(saveRule, /bottom\s*:/);
  assert.doesNotMatch(stylesSource, /\.save-bar\s*\{[^}]*bottom\s*:/);
});

test("catalog mutations expose pending state and optimistic archive rollback", () => {
  assert.match(setupSource, /const \[pendingActions, setPendingActions\]/);
  assert.match(setupSource, /const pendingActionRef = useRef<Set<string>>\(new Set\(\)\)/);
  assert.match(setupSource, /pendingActionRef\.current\.has\(key\)/);
  assert.match(setupSource, /acquirePendingAction\(\{ pending: pendingActionRef\.current, key \}\)/);
  assert.match(setupSource, /releasePendingAction\(\{ pending: pendingActionRef\.current, key \}\)/);
  assert.match(setupSource, /if \(pendingActions\[key\] \|\| pendingActionRef\.current\.has\(key\)\) return undefined/);
  assert.match(setupSource, /onBusyChange\(true\)/);
  assert.match(setupSource, /onBusyChange\(pendingActionRef\.current\.size > 0\)/);
  assert.match(setupSource, /isKindReordering\("group"\)/);
  assert.match(setupSource, /isKindReordering\("activity"\)/);
  assert.match(setupSource, /isKindReordering\("goal"\)/);
  assert.match(setupSource, /sortCatalogItems/);
  assert.match(setupSource, /const \[catalogOverrides, setCatalogOverrides\]/);
  assert.match(setupSource, /optimistic: \{ archived: nextArchived \}/);
  assert.match(setupSource, /applyCatalogOverride/);
  assert.match(setupSource, /refresh failed/);
  assert.match(setupSource, /Created, but refresh failed; refresh the page before retrying/);
  assert.match(setupSource, /aria-busy=\{pending\}/);
  assert.match(setupSource, /disabled=\{pending\}/);
});

test("entry deletion has a duplicate-request guard and loading feedback", () => {
  assert.match(pageSource, /const \[isDeleting, setIsDeleting\]/);
  assert.match(pageSource, /if \(isDeleting \|\| isSaving \|\| !draft\.version/);
  assert.match(pageSource, /setIsDeleting\(true\)/);
  assert.match(pageSource, /disabled=\{isDeleting \|\| isSaving\}/);
  assert.match(pageSource, /isDeleting \? "Deleting…"/);
  assert.match(pageSource, /className="log-form" disabled=\{formBusy\} aria-busy=\{formBusy\}/);
  assert.match(pageSource, /<legend className="sr-only">Daily entry form<\/legend>/);
  assert.match(pageSource, /\{formBusy && <p className="sr-only" role="status">Daily entry form disabled while/);
});

test("bootstrap refreshes and setup navigation use a latest-request gate", () => {
  assert.match(pageSource, /const bootstrapRequestGate = useRef\(createLatestRequestGate\(\)\)/);
  assert.match(pageSource, /bootstrapRequestGate\.current\.begin\(\)/);
  assert.match(pageSource, /if \(request\.isCurrent\(\)\)/);
  assert.match(pageSource, /onBusyChange=\{setIsSetupBusy\}/);
  assert.match(pageSource, /disabled=\{isSetupBusy && view === "settings"\}/);
});

test("goals are above mood and persist through a dedicated optimistic toggle", () => {
  const goalsIndex = pageSource.indexOf('<section className="panel goals-panel"');
  const moodIndex = pageSource.indexOf('<section className="panel mood-panel">');
  assert.ok(goalsIndex >= 0 && moodIndex >= 0 && goalsIndex < moodIndex);
  assert.match(pageSource, /api\/goal-completions\//);
  assert.match(pageSource, /const pendingGoalRef = useRef<Set<string>>\(new Set\(\)\)/);
  assert.match(pageSource, /pendingGoalRef\.current\.has\(key\)/);
  assert.match(pageSource, /setDraft\(\(current\) => \{[\s\S]*completedGoalIds:/);
  assert.match(pageSource, /pending=\{pendingGoalKeys\.has\(/);
  assert.match(pageSource, /aria-busy=\{pending\}/);
  assert.match(pageSource, /disabled=\{isLoadingDate \|\| goalsBusy\}/);
  assert.match(pageSource, /if \(selectedDateRef\.current && hasPendingGoalToggle\(selectedDateRef\.current\)\)/);
  assert.match(pageSource, /The goal was restored/);
  assert.match(pageSource, /serverCompletedGoalIds/);
  assert.doesNotMatch(pageSource, /function toggleGoal[\s\S]*?updateDraft\(/);
});

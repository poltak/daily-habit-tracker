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
  const deleteHandler = pageSource.slice(pageSource.indexOf("async function deleteSelectedEntry"));
  assert.ok(
    deleteHandler.indexOf("hasPendingGoalToggle(selectedDate)") <
      deleteHandler.indexOf("window.confirm"),
  );
  assert.match(pageSource, /disabled=\{isDeleting \|\| isSaving \|\| goalsBusy \|\| selectionBusy\}/);
  assert.match(pageSource, /setIsDeleting\(true\)/);
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
  assert.match(pageSource, /disabled=\{isSavingGoalConfig \|\| \(isSetupBusy && view === "settings"\)\}/);
});

test("calendar shows entry moods and replaces the Entries route", () => {
  const calendarView = pageSource.slice(pageSource.indexOf("function CalendarView"));
  assert.match(pageSource, /type View = "log" \| "calendar" \| "settings" \| "goal"/);
  assert.match(pageSource, /if \(requestedView === "entries"\) return \{ view: "calendar" \}/);
  assert.doesNotMatch(pageSource, /function EntriesView/);
  assert.doesNotMatch(pageSource, /<span>Entries<\/span>/);
  assert.match(pageSource, /<span>Log<\/span>/);
  assert.match(pageSource, /<span>Calendar<\/span>/);
  assert.match(pageSource, /<span>Setup<\/span>/);
  assert.match(calendarView, /days: CalendarEntryDay\[\]/);
  assert.match(calendarView, /moodFor\(moods, entry\.moodId\)/);
  assert.match(calendarView, /className="calendar-mood-emoji"/);
  assert.doesNotMatch(calendarView, /UI_ICONS\.check/);
  assert.match(stylesSource, /--calendar-mood-color/);
  assert.match(stylesSource, /\.calendar-mood-emoji/);
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

test("goal setup supports linked and unlinked activities", () => {
  assert.match(pageSource, /No associated activity/);
  assert.match(pageSource, /activityId: config\.activityId/);
  assert.match(pageSource, /event\.target\.value \|\| null/);
  assert.match(setupSource, /onOpenGoal: \(goalId: string\) => void/);
  assert.match(setupSource, /Configure \$\{goal\.name\}/);
  assert.doesNotMatch(setupSource, /No linked activity/);
  assert.doesNotMatch(setupSource, /Change activity for \$\{goal\.name\}/);
});

test("mood and activity selections persist independently with optimistic pending guards", () => {
  assert.match(pageSource, /api\/day-selections\/\$\{logicalDate\}\/mood/);
  assert.match(pageSource, /api\/day-selections\/\$\{logicalDate\}\/activities\/\$\{id\}/);
  assert.match(pageSource, /const pendingSelectionRef = useRef<Set<string>>\(new Set\(\)\)/);
  assert.match(pageSource, /const linkedGoalIds = data\?\.goals/);
  assert.match(pageSource, /filter\(\(goal\) => !goal\.archived && goal\.activityId === id\)/);
  assert.match(pageSource, /filter\(\(goal\) => !goal\.archived && goal\.activityId === linkedActivityId\)/);
  assert.match(pageSource, /for \(const goalKey of linkedGoalKeys\)/);
  assert.match(pageSource, /affectedGoalCompletions/);
  assert.match(pageSource, /restoreGoalCompletionStates/);
  assert.match(pageSource, /const failedSelectionRef = useRef<Set<string>>\(new Set\(\)\)/);
  assert.equal(
    pageSource.match(/failedSelectionRef\.current\.delete\(key\)/g)?.length,
    2,
  );
  assert.match(pageSource, /failedSelectionRef\.current\.add\(key\)/);
  assert.match(pageSource, /const hasLocalDraftRef = useRef\(false\)/);
  assert.match(pageSource, /hasLocalDraftRef\.current = value;/);
  assert.match(pageSource, /pendingSelectionRef\.current\.has\(key\)/);
  assert.match(pageSource, /setSelectionPending\(key, true\)/);
  assert.match(pageSource, /The mood was restored/);
  assert.match(pageSource, /The activity was restored/);
  assert.match(pageSource, /aria-busy=\{pendingSelectionKeys\.has/);
  assert.match(pageSource, /disabled=\{isLoadingDate \|\| pendingSelectionKeys\.has/);
  assert.match(pageSource, /hasPendingGoalToggle\(selectedDate\) \|\| hasPendingSelectionToggle\(selectedDate\)/);
  assert.match(pageSource, /Wait for the mood, activity, or goal update to finish before saving the entry/);
  assert.match(pageSource, /disabled=\{isLoadingDate \|\| goalsBusy \|\| selectionBusy\}/);
  assert.match(pageSource, /Saving your mood or activity selection/);
  assert.match(pageSource, /serverSelections/);
  assert.match(pageSource, /!hasOtherPendingSelection && !hasLocalDraftRef\.current/);
  assert.match(pageSource, /const hasFailedSelection = \[\.\.\.failedSelectionRef\.current\]\.some\(/);
  assert.match(pageSource, /if \(!hasFailedSelection\) \{[\s\S]*setConnectionState\("online"\);[\s\S]*setMessage\(null\);/);
  assert.match(pageSource, /activityIds: applyActivitySelectionStates\(\{[\s\S]*activityIds: entry\.activityIds/);
});

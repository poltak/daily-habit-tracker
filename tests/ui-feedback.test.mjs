import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/journal.tsx", import.meta.url), "utf8");
const setupSource = await readFile(new URL("../app/components/setup-view.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const iconSource = await readFile(new URL("../app/components/icon.tsx", import.meta.url), "utf8");

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

test("a button in progress shows a circle spinner in place of its icon", () => {
  assert.match(iconSource, /pending \? <span className="spinner" aria-hidden="true" \/> : <Icon name=\{name\} \/>/);
  assert.match(stylesSource, /\.spinner \{[^}]*border-radius: 50%;[^}]*animation: spin/);
  assert.doesNotMatch(stylesSource, /\.pending-action \.material-symbols-rounded/);
  assert.doesNotMatch(setupSource, /UI_ICONS\.sync/);
  assert.equal((pageSource.match(/UI_ICONS\.sync/g) ?? []).length, 1, "only the connection status keeps the cloud icon");
});

test("entry deletion has a duplicate-request guard and loading feedback", () => {
  assert.match(pageSource, /const \[isDeleting, setIsDeleting\]/);
  assert.match(pageSource, /if \(isDeleting \|\| isSaving \|\| !draft\.version/);
  const deleteHandler = pageSource.slice(pageSource.indexOf("async function deleteSelectedEntry"));
  assert.ok(
    deleteHandler.indexOf("hasPendingGoalToggle(selectedDate)") <
      deleteHandler.indexOf("window.confirm"),
  );
  assert.match(pageSource, /disabled=\{isDeleting \|\| isSaving \|\| !isDateReady \|\| goalsBusy \|\| selectionBusy\}/);
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
  assert.match(pageSource, /const navLocked = isSavingGoalConfig \|\| isActivityCreateBusy \|\| \(isSetupBusy && view === "settings"\);/);
  assert.equal((pageSource.match(/disabled=\{navLocked\}/g) ?? []).length, 2, "the brand button and every nav button");
});

test("calendar shows entry moods and replaces the Entries route", () => {
  const calendarView = pageSource.slice(pageSource.indexOf("function CalendarView"));
  assert.match(pageSource, /type View = "log" \| "calendar" \| "settings" \| "goal"/);
  assert.match(pageSource, /if \(requestedView === "entries"\) return \{ view: "calendar" \}/);
  assert.doesNotMatch(pageSource, /function EntriesView/);
  assert.doesNotMatch(pageSource, /label: "Entries"|<span>Entries<\/span>/);
  assert.deepEqual([...pageSource.matchAll(/\{ view: "(\w+)", label: "(\w+)", icon:/g)].map((match) => `${match[1]}:${match[2]}`), ["log:Log", "calendar:Calendar", "insights:Insights", "settings:Setup"]);
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
  assert.match(pageSource, /disabled=\{isLoadingDate \|\| !isDateReady\}/);
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
  assert.match(pageSource, /completedGoalIds: applyToggles\(draftRef\.current\.completedGoalIds, previousGoalStates\)/);
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
  assert.match(pageSource, /Saving your mood or activity selection/);
  assert.match(pageSource, /serverSelections/);
  assert.match(pageSource, /!hasOtherPendingSelection && !hasLocalDraftRef\.current/);
  assert.match(pageSource, /const hasFailedSelection = \[\.\.\.failedSelectionRef\.current\]\.some\(/);
  assert.match(pageSource, /if \(!hasFailedSelection\) \{[\s\S]*setConnectionState\("online"\);[\s\S]*setMessage\(null\);/);
  assert.match(pageSource, /activityIds: applyToggles\(entry\.activityIds, selectionToggles\(affectedActivitySelections\)\)/);
});

test("visible log refreshes merge the selected day without replacing local work", () => {
  assert.match(pageSource, /const dayRefreshRequestGate = useRef\(createLatestRequestGate\(\)\)/);
  assert.match(pageSource, /const localMutationEpochRef = useRef\(0\)/);
  assert.match(pageSource, /window\.setInterval\(\(\) => \{[\s\S]*?refreshSelectedDay\(\);[\s\S]*?\}, 15_000\)/);
  assert.match(pageSource, /window\.addEventListener\("focus", refreshOnReturn\)/);
  assert.match(pageSource, /document\.addEventListener\("visibilitychange", refreshOnReturn\)/);
  const refreshStart = pageSource.indexOf("async function refreshSelectedDay");
  const refreshHandler = pageSource.slice(refreshStart, pageSource.indexOf("function openDatePicker", refreshStart));
  assert.match(refreshHandler, /fetchDayState\(\{ logicalDate, signal: request\.signal/);
  assert.match(pageSource, /fetch\(`\/api\/entries\/\$\{logicalDate\}`, \{ cache: "no-store", signal \}\)/);
  assert.match(pageSource, /if \(!response\.ok && response\.status !== 404\) throw new Error\(errorText\)/);
  assert.match(refreshHandler, /hasLocalDraftRef\.current/);
  assert.match(refreshHandler, /localMutationEpochRef\.current === mutationEpoch/);
  assert.match(refreshHandler, /if \(request\.signal\.aborted \|\| !isRelevant\(\)\) return/);
  assert.match(refreshHandler, /hasPendingGoalToggle\(logicalDate\)/);
  assert.match(refreshHandler, /hasPendingSelectionToggle\(logicalDate\)/);
  assert.doesNotMatch(refreshHandler, /chooseDate\(/);
});

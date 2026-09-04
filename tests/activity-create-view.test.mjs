import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const setupSource = await readFile(new URL("../app/components/setup-view.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("activity creation route preserves source and falls back to an active group", () => {
  assert.match(pageSource, /type View = .*"add-activity"/);
  assert.match(pageSource, /requestedView === "add-activity"/);
  assert.match(pageSource, /params\.get\("group"\) \?\? params\.get\("groupId"\)/);
  assert.match(pageSource, /params\.get\("from"\) === "settings" \? "settings" : "log"/);
  assert.match(pageSource, /resolveActiveActivityGroupId/);
  assert.match(pageSource, /groups\.find\(\(group\) => !group\.archived\)/);
  assert.match(pageSource, /onOpenAddActivity=\{\(groupId\) => changeView\("add-activity", \{ groupId, returnView: "log" \}\)\}/);
  assert.match(pageSource, /onOpenAddActivity=\{\(groupId\) => changeView\("add-activity", \{ groupId, returnView: "settings" \}\)\}/);
});

test("log and setup group headers share an isolated Add new action", () => {
  assert.equal((pageSource.match(/className="add-activity-button"/g) ?? []).length, 1);
  assert.equal((setupSource.match(/className="add-activity-button"/g) ?? []).length, 1);
  for (const source of [pageSource, setupSource]) {
    assert.match(source, /event\.preventDefault\(\)/);
    assert.match(source, /event\.stopPropagation\(\)/);
    assert.match(source, />\s*\+ Add new\s*</);
  }
  assert.match(stylesSource, /\.add-activity-button\s*\{/);
});

test("add activity form uses the icon picker and catalog activity contract", () => {
  const createView = pageSource.slice(pageSource.indexOf("function AddActivityView"));
  assert.match(createView, /<h1>Add new activity<\/h1>/);
  assert.match(createView, /placeholder="Activity name"/);
  assert.match(createView, /<select aria-label="Activity group"/);
  assert.match(createView, /<IconPicker/);
  assert.match(createView, /kind: "activity"/);
  assert.match(createView, /groupId: activeGroupId/);
  assert.match(createView, /icon \}/);
  assert.match(createView, /await onRefresh\(\)/);
  assert.match(createView, /onBack\(\{ kind: "success", text: "Activity added\." \}\)/);
  assert.match(createView, /isSaving \? "Adding…"/);
});

test("setup keeps group and goal forms but removes the old activity form", () => {
  assert.match(setupSource, /payload: \{ kind: "group", name: groupName \}/);
  assert.match(setupSource, /payload: \{ kind: "goal", name: goalName \}/);
  assert.doesNotMatch(setupSource, /placeholder="New activity name"/);
  assert.doesNotMatch(setupSource, /value=\{activityGroup\}/);
  assert.match(setupSource, /onOpenAddActivity: \(groupId: string\) => void/);
});

test("activity creation keeps the parent route busy until POST and refresh finish", () => {
  assert.match(pageSource, /const \[isActivityCreateBusy, setIsActivityCreateBusy\]/);
  assert.match(pageSource, /const activityCreateBusyRef = useRef\(false\)/);
  assert.match(pageSource, /function setActivityCreateBusy\(busy: boolean\) \{\s*activityCreateBusyRef\.current = busy;\s*setIsActivityCreateBusy\(busy\);/);
  assert.match(pageSource, /onBusyChange=\{setActivityCreateBusy\}/);
  assert.match(pageSource, /activityCreateBusyRef\.current = isActivityCreateBusy/);
  assert.match(pageSource, /if \(activityCreateBusyRef\.current && viewRef\.current === "add-activity" && nextView !== "add-activity"\)/);
  assert.match(pageSource, /Wait for the activity update to finish before leaving this view/);
  assert.match(pageSource, /activityCreateBusyRef\.current && viewRef\.current === "add-activity" && nextRoute\.view !== "add-activity" && !pendingRouteNoticeRef\.current/);
  assert.match(pageSource, /groupId: currentView === "add-activity" \? activityGroupIdRef\.current/);
  assert.match(pageSource, /returnView: currentView === "add-activity" \? activityReturnViewRef\.current/);
  assert.match(pageSource, /disabled=\{isSavingGoalConfig \|\| isActivityCreateBusy/);
  assert.match(pageSource, /onBusyChange\(true\)/);
  assert.match(pageSource, /onBusyChange\(false\)/);
});

import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { JournalLogic } from "./journal-logic.js";
import {
  ACTIVE_DRAFT_DATE_KEY,
  daysAgo,
  draftKey,
  saveOnAnotherDevice,
  seedCatalog,
  todayOf,
} from "./journal-test-helpers.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, async (app) => {
    await seedCatalog(app);
    return new JournalLogic(app.frontend);
  });
}

const REFRESH_MS = 15_000;
const LOCAL_DAY_MS = 60_000;

describe("JournalLogic refreshing the open day", () => {
  it("should show a change from another device on the timer, and on the return of focus", async () => {
    const app = await setupTest();
    const { frontend, logic } = app;
    const today = todayOf(app);
    await saveOnAnotherDevice(app, { logicalDate: today, moodId: "mood-good" });

    frontend.services.timers.fire({ intervalMs: REFRESH_MS });
    await expect.poll(() => logic.state.entry?.moodId).toEqual("mood-good");

    expect(logic.state.draft).toMatchObject({
      moodId: "mood-good",
      version: 1,
    });
    expect(logic.state.connection).toEqual("online");
    await saveOnAnotherDevice(app, {
      logicalDate: today,
      moodId: "mood-bad",
      expectedVersion: 1,
    });
    frontend.services.windowFocus.focus();
    await expect.poll(() => logic.state.entry?.moodId).toEqual("mood-bad");
    expect(logic.state.draft.version).toEqual(2);
  });

  it("should show an entry that another device deleted", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, frontend, logic } = app;
    await saveOnAnotherDevice(app, {
      logicalDate: todayOf(app),
      moodId: "mood-good",
    });
    await logic.initialize();
    expect(logic.state.entry?.moodId).toEqual("mood-good");
    await backend.logic.days.deleteEntry({
      logicalDate: todayOf(app),
      expectedVersion: 1,
    });

    frontend.services.timers.fire({ intervalMs: REFRESH_MS });

    await expect.poll(() => logic.state.entry).toEqual(null);
    expect(logic.state.draft.moodId).toEqual("");
  });

  it("should not read the day while the page is hidden", async () => {
    const app = await setupTest();
    const { frontend, logic } = app;
    await saveOnAnotherDevice(app, {
      logicalDate: todayOf(app),
      moodId: "mood-good",
    });

    frontend.services.device.setVisible(false);
    frontend.services.timers.fire({ intervalMs: REFRESH_MS });
    await logic.refreshDay();

    expect(logic.state.refreshDayState).toEqual("pristine");
    expect(logic.state.entry).toEqual(null);
  });

  it("should not read the day while the device is offline", async () => {
    const app = await setupTest();
    const { frontend, logic } = app;
    await saveOnAnotherDevice(app, {
      logicalDate: todayOf(app),
      moodId: "mood-good",
    });

    frontend.services.device.setOnline(false);
    frontend.services.timers.fire({ intervalMs: REFRESH_MS });

    expect(logic.state.refreshDayState).toEqual("pristine");
    expect(logic.state.entry).toEqual(null);
    expect(logic.state.connection).toEqual("offline");
  });

  it("should keep the draft of this device and not read the day", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { frontend, logic } = app;
    const today = todayOf(app);
    frontend.browserStorage.setItem(
      draftKey(today),
      JSON.stringify({
        logicalDate: today,
        draft: {
          moodId: "mood-meh",
          activityIds: [],
          completedGoalIds: [],
          localTime: "23:00",
        },
        savedAt: "x",
      }),
    );
    frontend.browserStorage.setItem(ACTIVE_DRAFT_DATE_KEY, today);
    await logic.initialize();
    await saveOnAnotherDevice(app, { logicalDate: today, moodId: "mood-good" });

    await logic.refreshDay();

    expect(logic.state.refreshDayState).toEqual("pristine");
    expect(logic.state.draft.moodId).toEqual("mood-meh");
  });

  it("should show a sync issue when the day cannot be read, and recover on the next read", async () => {
    const { logic, transport } = await setupTest();
    transport.goOffline();

    const refreshP = logic.refreshDay();
    expect(logic.state.refreshDayState).toEqual("running");
    await refreshP;

    expect(logic.state.refreshDayState).toEqual("error");
    expect(logic.state.connection).toEqual("error");
    expect(logic.state.notice).toEqual(null);
    transport.goOnline();

    await logic.refreshDay();

    expect(logic.state.refreshDayState).toEqual("success");
    expect(logic.state.connection).toEqual("online");
  });

  it("should drop the answer when the owner changes the day while it is read", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    const today = todayOf(app);
    await saveOnAnotherDevice(app, { logicalDate: today, moodId: "mood-good" });
    const held = transport.holdNextResponse();

    const refreshP = logic.refreshDay();
    await held.reached;
    await logic.chooseDate({ logicalDate: daysAgo(app, 1) });
    held.release();
    await refreshP;

    expect(logic.state.selectedDate).toEqual(daysAgo(app, 1));
    expect(logic.state.entry).toEqual(null);
    expect(logic.state.draft.moodId).toEqual("");
  });
});

describe("JournalLogic following the clock and the connection", () => {
  it("should move today when the clock passes midnight", async () => {
    const app = await setupTest();
    const { frontend, logic } = app;
    const today = todayOf(app);
    const tomorrow = daysAgo(app, -1);
    expect(logic.isLatestDay()).toEqual(true);

    frontend.services.clock.advance(24 * 60 * 60 * 1000);
    frontend.services.timers.fire({ intervalMs: LOCAL_DAY_MS });

    expect(logic.state.today).toEqual(tomorrow);
    expect(logic.state.yesterday).toEqual(today);
    expect(logic.state.selectedDate).toEqual(today);
    expect(logic.isLatestDay()).toEqual(false);
  });

  it("should show whether the device is online", async () => {
    const { frontend, logic } = await setupTest();

    frontend.services.device.setOnline(false);
    expect(logic.state.connection).toEqual("offline");
    frontend.services.device.setOnline(true);
    expect(logic.state.connection).toEqual("online");
  });
});

describe("JournalLogic searching the activities", () => {
  it("should keep the search, and close every group when the search ends", async () => {
    const { logic } = await setupTest();
    logic.setGroupOpen({ groupId: "group-health", open: true });
    logic.setGroupOpen({ groupId: "group-work", open: true });
    logic.setGroupOpen({ groupId: "group-work", open: false });
    expect(logic.state.openGroupIds).toEqual(["group-health"]);

    logic.setActivityQuery({ query: "ga" });
    expect(logic.state).toMatchObject({
      activityQuery: "ga",
      openGroupIds: ["group-health"],
    });
    logic.setActivityQuery({ query: "" });

    expect(logic.state.activityQuery).toEqual("");
    expect(logic.state.openGroupIds).toEqual([]);
  });
});

describe("JournalLogic swiping the date", () => {
  it("should open the day before after a long swipe to the right", async () => {
    const app = await setupTest();
    const { logic } = app;

    logic.beginSwipe({ x: 100, y: 10 });
    logic.moveSwipe({ x: 160 });
    expect(logic.plugins.swipe.state.pull).toEqual(20);
    await logic.endSwipe({ x: 200, y: 12 });

    expect(logic.plugins.swipe.state.pull).toEqual(0);
    expect(logic.state.selectedDate).toEqual(daysAgo(app, 1));
    expect(logic.state.loadedDate).toEqual(daysAgo(app, 1));
  });

  it("should open the day after after a long swipe to the left, and stop at today", async () => {
    const app = await setupTest();
    const { logic } = app;
    await logic.chooseDate({ logicalDate: daysAgo(app, 2) });

    logic.beginSwipe({ x: 200, y: 10 });
    await logic.endSwipe({ x: 100, y: 10 });
    expect(logic.state.selectedDate).toEqual(daysAgo(app, 1));
    logic.beginSwipe({ x: 200, y: 10 });
    await logic.endSwipe({ x: 100, y: 10 });
    expect(logic.state.selectedDate).toEqual(daysAgo(app, 0));
    logic.beginSwipe({ x: 200, y: 10 });
    logic.moveSwipe({ x: 100 });
    expect(logic.plugins.swipe.state.pull).toEqual(0);
    await logic.endSwipe({ x: 100, y: 10 });

    expect(logic.state.selectedDate).toEqual(daysAgo(app, 0));
  });

  it("should keep the day after a short swipe, a mostly vertical drag, and a cancelled touch", async () => {
    const app = await setupTest();
    const { logic } = app;

    logic.beginSwipe({ x: 100, y: 10 });
    await logic.endSwipe({ x: 130, y: 10 });
    logic.beginSwipe({ x: 100, y: 10 });
    await logic.endSwipe({ x: 200, y: 120 });
    logic.beginSwipe({ x: 100, y: 10 });
    await logic.endSwipe(null);
    logic.moveSwipe({ x: 300 });

    expect(logic.state.selectedDate).toEqual(todayOf(app));
    expect(logic.plugins.swipe.state.pull).toEqual(0);
  });
});

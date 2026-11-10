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
  saveWholeDayOnAnotherDevice,
  seedCatalog,
  todayOf,
} from "./journal-test-helpers.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, async (app) => {
    await seedCatalog(app);
    return new JournalLogic(app.frontend);
  });
}

describe("JournalLogic opening the journal", () => {
  it("should add the starting catalog to a new journal, and open today", async () => {
    const { backend, frontend, logic, auth } = await setupLogicTest(
      { skipInitialization: true },
      (app) => new JournalLogic(app.frontend),
    );
    void auth;
    expect(logic.state.selectedDate).toEqual("");
    expect(logic.state.connection).toEqual("checking");
    expect(
      await backend.db.selectFrom("moodLevels").selectAll().execute(),
    ).toEqual([]);

    const initializeP = logic.initialize();
    await initializeP;

    const { catalog } = logic.plugins;
    expect(catalog.state.moods.map(({ name }) => name)).toEqual([
      "Rad",
      "Good",
      "Meh",
      "Bad",
      "Awful",
    ]);
    expect(catalog.state.groups.map(({ name }) => name)).toEqual([
      "Health",
      "Work",
      "Home",
      "People",
      "Leisure",
    ]);
    expect(catalog.state.activities).toHaveLength(12);
    expect(catalog.state.goals.map(({ name }) => name)).toEqual([
      "Move your body",
      "Read",
    ]);
    const today = new Date(frontend.services.clock.now())
      .toISOString()
      .slice(0, 10);
    expect(logic.state).toMatchObject({
      today,
      selectedDate: today,
      loadedDate: today,
      entry: null,
      connection: "online",
      notice: null,
    });
    expect(logic.state.draft).toMatchObject({
      moodId: "",
      activityIds: [],
      completedGoalIds: [],
    });
    expect(
      await backend.db.selectFrom("moodLevels").select("id").execute(),
    ).toHaveLength(5);
  });

  it("should say so when the journal cannot be reached, and open it after a retry", async () => {
    const { frontend, logic, transport } = await setupTest({
      skipInitialization: true,
    });
    transport.goOffline();
    frontend.services.device.setOnline(false);

    await logic.initialize();

    expect(logic.plugins.catalog.state.loadCatalogState).toEqual("error");
    expect(logic.state.connection).toEqual("offline");
    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "No connection. Check your internet connection and try again.",
    });
    expect(logic.state.selectedDate).toEqual("");
    transport.goOnline();
    frontend.services.device.setOnline(true);

    const retryP = logic.loadJournal();
    expect(logic.state.connection).toEqual("checking");
    await retryP;

    expect(logic.plugins.catalog.state.loadCatalogState).toEqual("success");
    expect(logic.state.loadedDate).not.toEqual("");
    expect(logic.state.connection).toEqual("online");
  });

  it("should open the day the owner left open, with the draft from this device", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { frontend, logic } = app;
    const earlier = daysAgo(app, 3);
    frontend.browserStorage.setItem(
      draftKey(earlier),
      JSON.stringify({
        logicalDate: earlier,
        draft: {
          moodId: "mood-meh",
          activityIds: ["activity-walk"],
          completedGoalIds: [],
          localTime: "21:30",
        },
        savedAt: "2026-01-01T10:00:00.000Z",
      }),
    );
    frontend.browserStorage.setItem(ACTIVE_DRAFT_DATE_KEY, earlier);

    await logic.initialize();

    expect(logic.state.selectedDate).toEqual(earlier);
    expect(logic.state.loadedDate).toEqual(earlier);
    expect(logic.state.entry).toEqual(null);
    expect(logic.state.draft).toMatchObject({
      moodId: "mood-meh",
      activityIds: ["activity-walk"],
      localTime: "21:30",
    });
  });

  it("should open today when the remembered day has not started, or its draft is not valid", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { frontend, logic } = app;
    const tomorrow = daysAgo(app, -1);
    frontend.browserStorage.setItem(
      draftKey(tomorrow),
      JSON.stringify({
        logicalDate: tomorrow,
        draft: {
          moodId: "mood-meh",
          activityIds: [],
          completedGoalIds: [],
          localTime: "21:30",
        },
        savedAt: "2026-01-01T10:00:00.000Z",
      }),
    );
    frontend.browserStorage.setItem(ACTIVE_DRAFT_DATE_KEY, tomorrow);

    await logic.initialize();

    expect(logic.state.selectedDate).toEqual(todayOf(app));
    expect(logic.state.draft.moodId).toEqual("");
  });
});

describe("JournalLogic choosing a day", () => {
  it("should show the saved entry of an earlier day", async () => {
    const app = await setupTest();
    const { backend, logic, transport } = app;
    const earlier = daysAgo(app, 2);
    await saveWholeDayOnAnotherDevice(app, {
      logicalDate: earlier,
      moodId: "mood-good",
      activityIds: ["activity-walk", "activity-gym"],
    });
    const rowsBefore = await backend.db
      .selectFrom("entries")
      .selectAll()
      .execute();
    const held = transport.holdNextRequest();

    const chooseP = logic.chooseDate({ logicalDate: earlier });
    expect(logic.state).toMatchObject({
      selectedDate: earlier,
      loadedDate: "",
      loadDayState: "running",
      entry: null,
    });
    await held.reached;
    held.release();
    await chooseP;

    expect(logic.state.loadDayState).toEqual("success");
    expect(logic.state.loadedDate).toEqual(earlier);
    expect(logic.state.entry).toMatchObject({
      logicalDate: earlier,
      moodId: "mood-good",
      version: 1,
      completedGoalIds: ["goal-move"],
    });
    expect(logic.state.draft).toMatchObject({
      moodId: "mood-good",
      version: 1,
      completedGoalIds: ["goal-move"],
    });
    expect([...logic.state.draft.activityIds].toSorted()).toEqual([
      "activity-gym",
      "activity-walk",
    ]);
    expect(
      await backend.db.selectFrom("entries").selectAll().execute(),
    ).toEqual(rowsBefore);
  });

  it("should open no day that has not started, and no text that is not a date", async () => {
    const app = await setupTest();
    const { logic } = app;
    const today = todayOf(app);

    await logic.chooseDate({ logicalDate: daysAgo(app, -1) });
    await logic.chooseDate({ logicalDate: "2026-02-30" });
    await logic.chooseDate({ logicalDate: "" });

    expect(logic.state.selectedDate).toEqual(today);
    expect(logic.state.loadDayState).toEqual("success");
    expect(logic.state.notice).toEqual(null);
  });

  it("should keep the day of the form and say so when the day cannot be read, and read it after a retry", async () => {
    const app = await setupTest();
    const { frontend, logic, transport } = app;
    const earlier = daysAgo(app, 1);
    transport.goOffline();
    frontend.services.device.setOnline(false);

    await logic.chooseDate({ logicalDate: earlier });

    expect(logic.state.loadDayState).toEqual("error");
    expect(logic.state.selectedDate).toEqual(earlier);
    expect(logic.state.loadedDate).toEqual("");
    expect(logic.state.connection).toEqual("offline");
    expect(logic.state.notice?.kind).toEqual("error");
    transport.goOnline();
    frontend.services.device.setOnline(true);

    await logic.chooseDate({ logicalDate: earlier });

    expect(logic.state.loadDayState).toEqual("success");
    expect(logic.state.loadedDate).toEqual(earlier);
    expect(logic.state.connection).toEqual("online");
    expect(logic.state.notice).toEqual(null);
  });

  it("should ignore a second request for a day while one day loads", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    const held = transport.holdNextRequest();

    const firstP = logic.chooseDate({ logicalDate: daysAgo(app, 1) });
    await logic.chooseDate({ logicalDate: daysAgo(app, 2) });
    expect(logic.state.selectedDate).toEqual(daysAgo(app, 1));
    await held.reached;
    held.release();
    await firstP;

    expect(logic.state.loadedDate).toEqual(daysAgo(app, 1));
  });

  it("should restore a draft of this device on top of a saved entry, and save it", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, frontend, logic } = app;
    const earlier = daysAgo(app, 2);
    await saveOnAnotherDevice(app, {
      logicalDate: earlier,
      moodId: "mood-good",
    });
    frontend.browserStorage.setItem(
      draftKey(earlier),
      JSON.stringify({
        logicalDate: earlier,
        draft: {
          moodId: "mood-rad",
          activityIds: ["activity-gym"],
          completedGoalIds: [],
          localTime: "23:00",
          version: 1,
        },
        savedAt: "2026-01-01T10:00:00.000Z",
      }),
    );
    await logic.initialize();

    await logic.chooseDate({ logicalDate: earlier });

    expect(logic.state.entry).toMatchObject({ moodId: "mood-rad", version: 2 });
    expect(logic.state.draft).toMatchObject({ moodId: "mood-rad", version: 2 });
    expect(frontend.browserStorage.getItem(draftKey(earlier))).toEqual(null);
    const row = await backend.db
      .selectFrom("entries")
      .select(["moodId", "version"])
      .where("logicalDate", "=", earlier)
      .executeTakeFirst();
    expect(row).toEqual({ moodId: "mood-rad", version: 2 });
  });

  it("should drop a draft of this device when the entry has changed since", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { frontend, logic } = app;
    const earlier = daysAgo(app, 2);
    await saveOnAnotherDevice(app, {
      logicalDate: earlier,
      moodId: "mood-good",
    });
    await saveOnAnotherDevice(app, {
      logicalDate: earlier,
      moodId: "mood-bad",
      expectedVersion: 1,
    });
    frontend.browserStorage.setItem(
      draftKey(earlier),
      JSON.stringify({
        logicalDate: earlier,
        draft: {
          moodId: "mood-rad",
          activityIds: [],
          completedGoalIds: [],
          localTime: "23:00",
          version: 1,
        },
        savedAt: "2026-01-01T10:00:00.000Z",
      }),
    );
    frontend.browserStorage.setItem(ACTIVE_DRAFT_DATE_KEY, earlier);

    await logic.initialize();

    expect(logic.state.draft).toMatchObject({ moodId: "mood-bad", version: 2 });
    expect(frontend.browserStorage.getItem(draftKey(earlier))).toEqual(null);
  });

  it("should ignore a draft of this device that is broken or is for another day", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { frontend, logic } = app;
    const earlier = daysAgo(app, 2);
    frontend.browserStorage.setItem(draftKey(earlier), "{not json");
    frontend.browserStorage.setItem(ACTIVE_DRAFT_DATE_KEY, earlier);
    frontend.browserStorage.setItem(
      draftKey(daysAgo(app, 1)),
      JSON.stringify({
        logicalDate: earlier,
        draft: { moodId: 5 },
        savedAt: "x",
      }),
    );

    await logic.initialize();
    await logic.chooseDate({ logicalDate: daysAgo(app, 1) });

    expect(logic.state.draft.moodId).toEqual("");
    expect(logic.state.notice).toEqual(null);
  });

  it("should drop an activity from a draft when the activity is gone", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, frontend, logic } = app;
    const earlier = daysAgo(app, 2);
    await backend.db
      .deleteFrom("goals")
      .where("activityId", "=", "activity-music")
      .execute();
    await backend.db
      .deleteFrom("activities")
      .where("id", "=", "activity-music")
      .execute();
    frontend.browserStorage.setItem(
      draftKey(earlier),
      JSON.stringify({
        logicalDate: earlier,
        draft: {
          moodId: "mood-meh",
          activityIds: ["activity-music", "activity-walk"],
          completedGoalIds: [],
          localTime: "23:00",
        },
        savedAt: "x",
      }),
    );
    frontend.browserStorage.setItem(ACTIVE_DRAFT_DATE_KEY, earlier);

    await logic.initialize();

    expect(logic.state.draft.activityIds).toEqual(["activity-walk"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { JournalLogic } from "./journal-logic.js";
import {
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

describe("JournalLogic tapping a mood", () => {
  it("should keep the mood on the server at once, before the day is saved", async () => {
    const app = await setupTest();
    const { backend, frontend, logic, transport } = app;
    const today = todayOf(app);
    const held = transport.holdNextRequest();

    const tapP = logic.toggleMood({ moodId: "mood-good" });
    expect(logic.plugins.selection.state.selectionState).toEqual("running");
    expect(logic.plugins.selection.state.pending).toEqual({ kind: "mood" });
    expect(logic.state.draft.moodId).toEqual("mood-good");
    expect(
      JSON.parse(frontend.browserStorage.getItem(draftKey(today)) ?? "{}").draft
        .moodId,
    ).toEqual("mood-good");
    expect(frontend.services.device.leaveWarning).toEqual(true);
    await held.reached;
    expect(
      await backend.db.selectFrom("dayMoodSelections").selectAll().execute(),
    ).toEqual([]);
    held.release();
    await tapP;

    expect(logic.plugins.selection.state.selectionState).toEqual("success");
    expect(logic.plugins.selection.state.pending).toEqual(null);
    expect(frontend.services.device.leaveWarning).toEqual(false);
    expect(logic.state).toMatchObject({ connection: "online", notice: null });
    expect(logic.state.draft.moodId).toEqual("mood-good");
    expect(frontend.browserStorage.getItem(draftKey(today))).toEqual(null);
    expect(
      await backend.db
        .selectFrom("dayMoodSelections")
        .select(["logicalDate", "moodId"])
        .execute(),
    ).toEqual([{ logicalDate: today, moodId: "mood-good" }]);
    expect(
      await backend.db.selectFrom("entries").selectAll().execute(),
    ).toEqual([]);
  });

  it("should change the mood of a saved entry on the form", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { logic } = app;
    await saveOnAnotherDevice(app, {
      logicalDate: todayOf(app),
      moodId: "mood-good",
    });
    await logic.initialize();

    await logic.toggleMood({ moodId: "mood-awful" });

    expect(logic.state.entry).toMatchObject({
      moodId: "mood-awful",
      version: 1,
    });
    expect(logic.state.draft).toMatchObject({
      moodId: "mood-awful",
      version: 1,
    });
  });

  it("should put the mood back, and say so, when the server cannot keep it", async () => {
    const app = await setupTest();
    const { backend, frontend, logic, transport } = app;
    await logic.toggleMood({ moodId: "mood-good" });
    transport.goOffline();
    frontend.services.device.setOnline(false);

    await logic.toggleMood({ moodId: "mood-rad" });

    expect(logic.plugins.selection.state.selectionState).toEqual("error");
    expect(logic.state.draft.moodId).toEqual("mood-good");
    expect(logic.state.connection).toEqual("offline");
    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "No connection. Check your internet connection and try again. The mood was restored.",
    });
    expect(frontend.browserStorage.getItem(draftKey(todayOf(app)))).toEqual(
      null,
    );
    expect(
      await backend.db
        .selectFrom("dayMoodSelections")
        .select("moodId")
        .execute(),
    ).toEqual([{ moodId: "mood-good" }]);
  });

  it("should refuse a mood that was deleted, and put the previous mood back", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    await backend.db
      .deleteFrom("moodLevels")
      .where("id", "=", "mood-meh")
      .execute();

    await logic.toggleMood({ moodId: "mood-meh" });

    expect(logic.state.draft.moodId).toEqual("");
    expect(logic.state.notice?.text).toEqual(
      "Choose one of the five moods. The mood was restored.",
    );
  });

  it("should do nothing for the mood the day has, or while the day loads", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    await logic.toggleMood({ moodId: "mood-good" });
    const held = transport.holdNextRequest();

    await logic.toggleMood({ moodId: "mood-good" });
    const chooseP = logic.chooseDate({ logicalDate: daysAgo(app, 1) });
    await logic.toggleMood({ moodId: "mood-rad" });
    await held.reached;
    held.release();
    await chooseP;

    expect(logic.plugins.selection.state.selectionState).toEqual("success");
    expect(logic.state.draft.moodId).toEqual("");
  });

  it("should keep a mood for an earlier day on the server, and show it again", async () => {
    const app = await setupTest();
    const { logic } = app;
    const earlier = daysAgo(app, 3);
    await logic.chooseDate({ logicalDate: earlier });
    await logic.toggleMood({ moodId: "mood-meh" });

    await logic.chooseDate({ logicalDate: todayOf(app) });
    await logic.chooseDate({ logicalDate: earlier });

    expect(logic.state.draft.moodId).toEqual("mood-meh");
    expect(logic.state.entry).toEqual(null);
  });

  it("should refuse a second tap, and a change of the day, while a tap waits", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    const held = transport.holdNextRequest();

    const tapP = logic.toggleMood({ moodId: "mood-good" });
    await logic.toggleMood({ moodId: "mood-bad" });
    await logic.toggleActivity({ activityId: "activity-walk" });
    await logic.chooseDate({ logicalDate: daysAgo(app, 1) });
    expect(logic.state.notice).toEqual({
      kind: "info",
      text: "Wait for the mood or activity update to finish before changing the day.",
    });
    await held.reached;
    held.release();
    await tapP;

    expect(logic.state.selectedDate).toEqual(todayOf(app));
    expect(logic.state.draft).toMatchObject({
      moodId: "mood-good",
      activityIds: [],
    });
  });
});

describe("JournalLogic tapping an activity", () => {
  it("should select the activity and complete the goal that it belongs to", async () => {
    const app = await setupTest();
    const { backend, frontend, logic, transport } = app;
    const today = todayOf(app);
    const held = transport.holdNextRequest();

    const tapP = logic.toggleActivity({ activityId: "activity-gym" });
    expect(logic.plugins.selection.state.pending).toEqual({
      kind: "activity",
      id: "activity-gym",
    });
    expect(logic.state.draft).toMatchObject({
      activityIds: ["activity-gym"],
      completedGoalIds: ["goal-move"],
    });
    await held.reached;
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .selectAll()
        .execute(),
    ).toEqual([]);
    held.release();
    await tapP;

    expect(logic.plugins.selection.state.selectionState).toEqual("success");
    expect(logic.state.draft).toMatchObject({
      activityIds: ["activity-gym"],
      completedGoalIds: ["goal-move"],
    });
    expect(frontend.browserStorage.getItem(draftKey(today))).toEqual(null);
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .select(["logicalDate", "activityId", "selected"])
        .execute(),
    ).toEqual([
      { logicalDate: today, activityId: "activity-gym", selected: 1 },
    ]);
    expect(
      await backend.db
        .selectFrom("goalCompletions")
        .select(["id", "goalId", "logicalDate", "entryId"])
        .execute(),
    ).toEqual([
      {
        id: `completion-goal-move-${today}`,
        goalId: "goal-move",
        logicalDate: today,
        entryId: null,
      },
    ]);
  });

  it("should take the activity and its goal off the day with the next tap", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    await logic.toggleActivity({ activityId: "activity-gym" });

    await logic.toggleActivity({ activityId: "activity-gym" });

    expect(logic.state.draft).toMatchObject({
      activityIds: [],
      completedGoalIds: [],
    });
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .select("selected")
        .execute(),
    ).toEqual([{ selected: 0 }]);
    expect(
      await backend.db.selectFrom("goalCompletions").selectAll().execute(),
    ).toEqual([]);
  });

  it("should select an activity with no goal, and change the entry of a saved day", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic } = app;
    const today = todayOf(app);
    await saveOnAnotherDevice(app, {
      logicalDate: today,
      moodId: "mood-good",
      activityIds: ["activity-walk"],
    });
    await logic.initialize();

    await logic.toggleActivity({ activityId: "activity-music" });
    await logic.toggleActivity({ activityId: "activity-walk" });

    expect(logic.state.entry?.activityIds).toEqual(["activity-music"]);
    expect(logic.state.draft.activityIds).toEqual(["activity-music"]);
    expect(logic.state.draft.completedGoalIds).toEqual([]);
    expect(
      await backend.db
        .selectFrom("entryActivities")
        .select("activityId")
        .execute(),
    ).toEqual([{ activityId: "activity-walk" }]);
  });

  it("should put the activity and its goal back, and say so, when the server cannot keep them", async () => {
    const app = await setupTest();
    const { backend, frontend, logic, transport } = app;
    transport.goOffline();
    frontend.services.device.setOnline(false);

    await logic.toggleActivity({ activityId: "activity-gym" });

    expect(logic.plugins.selection.state.selectionState).toEqual("error");
    expect(logic.state.draft).toMatchObject({
      activityIds: [],
      completedGoalIds: [],
    });
    expect(logic.state.notice?.text).toEqual(
      "No connection. Check your internet connection and try again. The activity was restored.",
    );
    expect(logic.state.connection).toEqual("offline");
    expect(frontend.browserStorage.getItem(draftKey(todayOf(app)))).toEqual(
      null,
    );
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });

  it("should refuse an activity that was deleted, and put the form back", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    await backend.db
      .deleteFrom("goals")
      .where("activityId", "=", "activity-gym")
      .execute();
    await backend.db
      .deleteFrom("activities")
      .where("id", "=", "activity-gym")
      .execute();

    await logic.toggleActivity({ activityId: "activity-gym" });

    expect(logic.state.draft.activityIds).toEqual([]);
    expect(logic.state.notice?.text).toEqual(
      "One activity is no longer available. The activity was restored.",
    );
  });

  it("should keep a draft of this device when the tap fails on a day that held one", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { frontend, logic, transport } = app;
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
    frontend.browserStorage.setItem("daymark:active-draft-date:v1", today);
    await logic.initialize();
    transport.goOffline();

    await logic.toggleActivity({ activityId: "activity-walk" });

    expect(
      JSON.parse(frontend.browserStorage.getItem(draftKey(today)) ?? "{}")
        .draft,
    ).toMatchObject({ moodId: "mood-meh", activityIds: [] });
  });
});

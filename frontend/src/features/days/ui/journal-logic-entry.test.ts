import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { JournalLogic } from "./journal-logic.js";
import {
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

async function tapSomething(logic: JournalLogic) {
  await logic.toggleMood({ moodId: "mood-good" });
  await logic.toggleActivity({ activityId: "activity-gym" });
  await logic.toggleActivity({ activityId: "activity-walk" });
}

describe("JournalLogic saving the entry", () => {
  it("should save the mood and the activities, and take the taps into the entry", async () => {
    const app = await setupTest();
    const { backend, frontend, logic, transport } = app;
    const today = todayOf(app);
    await tapSomething(logic);
    const held = transport.holdNextRequest();

    const saveP = logic.saveEntry();
    expect(logic.plugins.entryActions.state.saveState).toEqual("running");
    expect(logic.state.connection).toEqual("checking");
    expect(frontend.services.device.leaveWarning).toEqual(true);
    await held.reached;
    expect(
      await backend.db.selectFrom("entries").selectAll().execute(),
    ).toEqual([]);
    held.release();
    await saveP;

    expect(logic.plugins.entryActions.state.saveState).toEqual("success");
    expect(frontend.services.device.leaveWarning).toEqual(false);
    expect(logic.state.entry).toMatchObject({
      logicalDate: today,
      moodId: "mood-good",
      version: 1,
      completedGoalIds: ["goal-move"],
    });
    expect([...(logic.state.entry?.activityIds ?? [])].toSorted()).toEqual([
      "activity-gym",
      "activity-walk",
    ]);
    expect(logic.state.draft).toMatchObject({
      version: 1,
      moodId: "mood-good",
    });
    expect(logic.state.connection).toEqual("online");
    expect(logic.state.notice?.kind).toEqual("success");
    expect(logic.state.notice?.text).toMatch(/^Saved [A-Z][a-z]{2} \d{1,2}\.$/);
    const [row] = await backend.db.selectFrom("entries").selectAll().execute();
    expect(row).toMatchObject({
      logicalDate: today,
      moodId: "mood-good",
      version: 1,
      localTime: "23:00",
      deletedAt: null,
    });
    expect(
      (
        await backend.db
          .selectFrom("entryActivities")
          .select("activityId")
          .execute()
      )
        .map((link) => link.activityId)
        .toSorted(),
    ).toEqual(["activity-gym", "activity-walk"]);
    expect(
      await backend.db.selectFrom("dayMoodSelections").selectAll().execute(),
    ).toEqual([]);
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .selectAll()
        .execute(),
    ).toEqual([]);
    expect(
      await backend.db
        .selectFrom("goalCompletions")
        .select("entryId")
        .execute(),
    ).toEqual([{ entryId: row?.id }]);
  });

  it("should change the entry of a saved day with the next save", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    await tapSomething(logic);
    await logic.saveEntry();
    await logic.toggleMood({ moodId: "mood-bad" });

    expect(logic.state.entry?.moodId).toEqual("mood-bad");
    const rowBefore = await backend.db
      .selectFrom("entries")
      .select("version")
      .executeTakeFirst();
    expect(rowBefore?.version).toEqual(1);
  });

  it("should ask for a mood, and send nothing, when the day has none", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    await logic.toggleActivity({ activityId: "activity-walk" });

    await logic.saveEntry();

    expect(logic.plugins.entryActions.state.saveState).toEqual("pristine");
    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Pick the mood that best sums up the day.",
    });
    expect(
      await backend.db.selectFrom("entries").selectAll().execute(),
    ).toEqual([]);
  });

  it("should not save while the device is offline, and save after it is back", async () => {
    const app = await setupTest();
    const { backend, frontend, logic } = app;
    await logic.toggleMood({ moodId: "mood-meh" });
    frontend.services.device.setOnline(false);

    await logic.saveEntry();

    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "You’re offline. Reconnect to save this entry.",
    });
    expect(logic.state.connection).toEqual("offline");
    expect(logic.state.entry).toEqual(null);
    expect(
      await backend.db.selectFrom("entries").selectAll().execute(),
    ).toEqual([]);
    frontend.services.device.setOnline(true);

    await logic.saveEntry();

    expect(logic.state.entry?.moodId).toEqual("mood-meh");
  });

  it("should keep the form and say so when the save does not reach the server", async () => {
    const app = await setupTest();
    const { backend, logic, transport } = app;
    await logic.toggleMood({ moodId: "mood-meh" });
    transport.goOffline();

    await logic.saveEntry();

    expect(logic.plugins.entryActions.state.saveState).toEqual("error");
    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "No connection. Check your internet connection and try again. Try again.",
    });
    expect(logic.state.connection).toEqual("error");
    expect(logic.state.entry).toEqual(null);
    expect(logic.state.draft.moodId).toEqual("mood-meh");
    expect(
      await backend.db.selectFrom("entries").selectAll().execute(),
    ).toEqual([]);
  });

  it("should refuse a save over an entry that another device changed", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic } = app;
    const today = todayOf(app);
    await saveOnAnotherDevice(app, { logicalDate: today, moodId: "mood-good" });
    await logic.initialize();
    await saveOnAnotherDevice(app, {
      logicalDate: today,
      moodId: "mood-bad",
      expectedVersion: 1,
    });
    await logic.toggleMood({ moodId: "mood-rad" });

    await logic.saveEntry();

    expect(logic.plugins.entryActions.state.saveState).toEqual("error");
    expect(logic.state.notice?.text).toEqual(
      "This entry changed on another device. Try again.",
    );
    const row = await backend.db
      .selectFrom("entries")
      .select(["moodId", "version"])
      .executeTakeFirst();
    expect(row).toEqual({ moodId: "mood-bad", version: 2 });
  });

  it("should keep one of two saves at the same time, and refuse the other", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, frontend, logic } = app;
    const second = new JournalLogic(frontend);
    await saveOnAnotherDevice(app, {
      logicalDate: todayOf(app),
      moodId: "mood-good",
      activityIds: ["activity-walk"],
    });
    await logic.initialize();
    await second.initialize();
    await logic.toggleMood({ moodId: "mood-rad" });
    await second.toggleMood({ moodId: "mood-meh" });

    await Promise.all([logic.saveEntry(), second.saveEntry()]);

    const states = [logic, second].map(
      (item) => item.plugins.entryActions.state.saveState,
    );
    expect(states.toSorted()).toEqual(["error", "success"]);
    const winner = states[0] === "success" ? logic : second;
    const row = await backend.db
      .selectFrom("entries")
      .select(["moodId", "version"])
      .executeTakeFirst();
    expect(row).toEqual({ moodId: winner.state.entry?.moodId, version: 2 });
    await second.cleanup();
  });

  it("should wait for a tap before it saves", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    await logic.toggleMood({ moodId: "mood-good" });
    const held = transport.holdNextRequest();

    const tapP = logic.toggleActivity({ activityId: "activity-walk" });
    await logic.saveEntry();
    expect(logic.state.notice).toEqual({
      kind: "info",
      text: "Wait for the mood, activity, or goal update to finish before saving the entry.",
    });
    await held.reached;
    held.release();
    await tapP;

    expect(logic.state.entry).toEqual(null);
  });

  it("should refuse a day that has not started anywhere, and put the mood back", async () => {
    const app = await setupTest();
    const { backend, frontend, logic } = app;
    frontend.services.clock.advance(3 * 24 * 60 * 60 * 1000);
    frontend.services.timers.fire({ intervalMs: 60_000 });
    await logic.chooseDate({ logicalDate: logic.state.today });

    await logic.toggleMood({ moodId: "mood-good" });

    expect(logic.state.notice?.text).toEqual(
      "That day has not started yet. Choose today or an earlier day. The mood was restored.",
    );
    expect(logic.state.draft.moodId).toEqual("");
    expect(
      await backend.db.selectFrom("dayMoodSelections").selectAll().execute(),
    ).toEqual([]);
  });
});

describe("JournalLogic deleting the entry", () => {
  it("should delete the entry after the owner agrees, and keep its row", async () => {
    const app = await setupTest();
    const { backend, frontend, logic, transport } = app;
    await tapSomething(logic);
    await logic.saveEntry();
    const held = transport.holdNextRequest();

    const deleteP = logic.deleteEntry();
    expect(logic.plugins.entryActions.state.deleteState).toEqual("running");
    expect(frontend.services.dialogs.questions).toHaveLength(1);
    expect(frontend.services.dialogs.questions[0]).toMatch(
      /^Delete the entry for [A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}, \d{4}\?$/,
    );
    await held.reached;
    expect(
      (
        await backend.db
          .selectFrom("entries")
          .select("deletedAt")
          .executeTakeFirst()
      )?.deletedAt,
    ).toEqual(null);
    held.release();
    await deleteP;

    expect(logic.plugins.entryActions.state.deleteState).toEqual("success");
    expect(logic.state.entry).toEqual(null);
    expect(logic.state.draft).toMatchObject({
      moodId: "",
      activityIds: [],
      completedGoalIds: ["goal-move"],
    });
    expect(logic.state.notice).toEqual({
      kind: "success",
      text: "Entry deleted.",
    });
    const row = await backend.db
      .selectFrom("entries")
      .select(["version", "deletedAt"])
      .executeTakeFirstOrThrow();
    expect(row.version).toEqual(2);
    expect(row.deletedAt).not.toEqual(null);
  });

  it("should save the day again after the delete, on the same row", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    await logic.toggleMood({ moodId: "mood-good" });
    await logic.saveEntry();
    await logic.deleteEntry();
    await logic.toggleMood({ moodId: "mood-bad" });

    await logic.saveEntry();

    expect(logic.state.entry).toMatchObject({ moodId: "mood-bad", version: 3 });
    expect(
      await backend.db.selectFrom("entries").select("deletedAt").execute(),
    ).toEqual([{ deletedAt: null }]);
  });

  it("should keep the entry when the owner does not agree", async () => {
    const app = await setupTest();
    const { backend, frontend, logic } = app;
    await logic.toggleMood({ moodId: "mood-good" });
    await logic.saveEntry();
    frontend.services.dialogs.answerWith(false);

    await logic.deleteEntry();

    expect(logic.plugins.entryActions.state.deleteState).toEqual("pristine");
    expect(logic.state.entry).not.toEqual(null);
    expect(
      (
        await backend.db
          .selectFrom("entries")
          .select("deletedAt")
          .executeTakeFirst()
      )?.deletedAt,
    ).toEqual(null);
  });

  it("should not delete while the device is offline", async () => {
    const app = await setupTest();
    const { frontend, logic } = app;
    await logic.toggleMood({ moodId: "mood-good" });
    await logic.saveEntry();
    frontend.services.device.setOnline(false);

    await logic.deleteEntry();

    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "You’re offline. Reconnect before deleting an entry.",
    });
    expect(logic.state.entry).not.toEqual(null);
  });

  it("should do nothing for a day with no entry", async () => {
    const { frontend, logic } = await setupTest();

    await logic.deleteEntry();

    expect(frontend.services.dialogs.questions).toEqual([]);
    expect(logic.plugins.entryActions.state.deleteState).toEqual("pristine");
  });

  it("should keep the entry and say so when another device changed it", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic } = app;
    const today = todayOf(app);
    await saveOnAnotherDevice(app, { logicalDate: today, moodId: "mood-good" });
    await logic.initialize();
    await saveOnAnotherDevice(app, {
      logicalDate: today,
      moodId: "mood-bad",
      expectedVersion: 1,
    });

    await logic.deleteEntry();

    expect(logic.plugins.entryActions.state.deleteState).toEqual("error");
    expect(logic.state.notice?.text).toEqual(
      "This entry changed on another device.",
    );
    expect(logic.state.entry).not.toEqual(null);
    expect(
      (
        await backend.db
          .selectFrom("entries")
          .select("deletedAt")
          .executeTakeFirst()
      )?.deletedAt,
    ).toEqual(null);
  });

  it("should wait for a tap before it deletes", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { logic, transport } = app;
    await saveOnAnotherDevice(app, {
      logicalDate: todayOf(app),
      moodId: "mood-good",
    });
    await logic.initialize();
    const held = transport.holdNextRequest();

    const tapP = logic.toggleActivity({ activityId: "activity-walk" });
    await logic.deleteEntry();
    expect(logic.state.notice?.kind).toEqual("info");
    await held.reached;
    held.release();
    await tapP;

    expect(logic.state.entry).not.toEqual(null);
  });
});

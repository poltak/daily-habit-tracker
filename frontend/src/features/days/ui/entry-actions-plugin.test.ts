import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { EntryActionsPlugin } from "./entry-actions-plugin.js";
import {
  saveOnAnotherDevice,
  seedCatalog,
  todayOf,
} from "./journal-test-helpers.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, async (app) => {
    await seedCatalog(app);
    return new EntryActionsPlugin(app.frontend);
  });
}

const DRAFT = {
  moodId: "mood-good",
  activityIds: ["activity-walk"],
  completedGoalIds: [],
  localTime: "20:15",
};

describe("EntryActionsPlugin tests", () => {
  it("should save an entry, and say that it runs", async () => {
    const app = await setupTest();
    const { backend, frontend, logic, transport } = app;
    const today = todayOf(app);
    const held = transport.holdNextRequest();

    const saveP = logic.save({ logicalDate: today, draft: DRAFT });
    expect(logic.isRunning).toEqual(true);
    expect(logic.state.saveState).toEqual("running");
    expect(frontend.services.device.leaveWarning).toEqual(true);
    await held.reached;
    held.release();
    const entry = await saveP;

    expect(entry).toMatchObject({
      logicalDate: today,
      moodId: "mood-good",
      localTime: "20:15",
      activityIds: ["activity-walk"],
      version: 1,
    });
    expect(logic.isRunning).toEqual(false);
    expect(logic.state.saveState).toEqual("success");
    expect(frontend.services.device.leaveWarning).toEqual(false);
    expect(
      await backend.db
        .selectFrom("entries")
        .select(["moodId", "localTime"])
        .execute(),
    ).toEqual([{ moodId: "mood-good", localTime: "20:15" }]);
  });

  it("should give nothing, and the message, when the save fails", async () => {
    const app = await setupTest();
    const { backend, logic } = app;

    const entry = await logic.save({
      logicalDate: todayOf(app),
      draft: { ...DRAFT, moodId: "mood-nope" },
    });

    expect(entry).toEqual(null);
    expect(logic.state.saveState).toEqual("error");
    expect(logic.state.saveError).toEqual("Choose one of the five moods.");
    expect(
      await backend.db.selectFrom("entries").selectAll().execute(),
    ).toEqual([]);
  });

  it("should refuse a save of a version that is out of date", async () => {
    const app = await setupTest();
    const { logic } = app;
    await saveOnAnotherDevice(app, {
      logicalDate: todayOf(app),
      moodId: "mood-bad",
    });

    const entry = await logic.save({ logicalDate: todayOf(app), draft: DRAFT });

    expect(entry).toEqual(null);
    expect(logic.state.saveError).toEqual(
      "This entry changed on another device.",
    );
  });

  it("should delete an entry of the version it has", async () => {
    const app = await setupTest();
    const { backend, logic, transport } = app;
    const today = todayOf(app);
    await saveOnAnotherDevice(app, { logicalDate: today, moodId: "mood-bad" });
    const held = transport.holdNextRequest();

    const removeP = logic.remove({ logicalDate: today, version: 1 });
    expect(logic.state.deleteState).toEqual("running");
    await held.reached;
    held.release();
    const removed = await removeP;

    expect(removed).toEqual(true);
    expect(logic.state.deleteState).toEqual("success");
    expect(
      (
        await backend.db
          .selectFrom("entries")
          .select("deletedAt")
          .executeTakeFirst()
      )?.deletedAt,
    ).not.toEqual(null);
  });

  it("should keep an entry that changed since, and an entry it cannot reach", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    const today = todayOf(app);
    await saveOnAnotherDevice(app, { logicalDate: today, moodId: "mood-bad" });

    expect(await logic.remove({ logicalDate: today, version: 5 })).toEqual(
      false,
    );
    expect(logic.state.deleteError).toEqual(
      "This entry changed on another device.",
    );
    transport.goOffline();
    expect(await logic.remove({ logicalDate: today, version: 1 })).toEqual(
      false,
    );
    expect(logic.state.deleteError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
  });
});

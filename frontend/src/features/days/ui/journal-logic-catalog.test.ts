import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import { JournalLogic } from "./journal-logic.js";
import {
  saveOnAnotherDevice,
  seedCatalog,
  todayOf,
} from "./journal-test-helpers.js";

function setupTest() {
  return setupLogicTest({ skipInitialization: true }, async (app) => {
    await seedCatalog(app);
    return new JournalLogic(app.frontend);
  });
}

describe("JournalLogic when a page changes the catalog", () => {
  it("should read the catalog and the open day again, so that a deleted activity leaves the day", async () => {
    const app = await setupTest();
    const { backend, frontend, logic } = app;
    await saveOnAnotherDevice(app, {
      logicalDate: todayOf(app),
      moodId: "mood-good",
      activityIds: ["activity-gym", "activity-walk"],
    });
    await logic.initialize();
    expect(logic.state.draft.activityIds.toSorted()).toEqual([
      "activity-gym",
      "activity-walk",
    ]);
    await backend.logic.catalogChange.deleteActivity({ id: "activity-gym" });

    await frontend.catalogEvents.emit({ type: "catalogChanged" });

    expect(
      logic.plugins.catalog.state.activities.map((activity) => activity.id),
    ).not.toContain("activity-gym");
    expect(logic.state.draft.activityIds).toEqual(["activity-walk"]);
    expect(logic.state.entry?.activityIds).toEqual(["activity-walk"]);
    expect(logic.state.notice).toEqual(null);
  });

  it("should show the notice that a page leaves for the log, and no other", async () => {
    const { frontend, logic } = await setupTest();
    await logic.initialize();

    await frontend.catalogEvents.emit({
      type: "catalogChanged",
      notice: { target: "settings", text: "Archived." },
    });
    expect(logic.state.notice).toEqual(null);
    await frontend.catalogEvents.emit({
      type: "catalogChanged",
      notice: { target: "log", text: "Activity added." },
    });

    expect(logic.state.notice).toEqual({
      kind: "success",
      text: "Activity added.",
    });
  });
});

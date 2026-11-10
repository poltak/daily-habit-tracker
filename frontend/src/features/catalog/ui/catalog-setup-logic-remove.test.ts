import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import { CatalogSetupLogic } from "./catalog-setup-logic.js";

function setupTest() {
  return setupLogicTest({}, async (app) => {
    await app.backend.logic.catalog.read();
    return new CatalogSetupLogic(app.frontend);
  });
}

describe("CatalogSetupLogic deleting", () => {
  it("should delete an activity after the warning, from the days and the goals", async () => {
    const { logic, frontend, backend } = await setupTest();
    await backend.logic.days.saveEntry({
      logicalDate: "2026-01-05",
      input: {
        moodId: "mood-good",
        activityIds: ["activity-gym", "activity-walk"],
        completedGoalIds: [],
      },
    });
    await logic.load();

    await logic.remove({ kind: "activity", id: "activity-gym", name: "Gym" });

    expect(frontend.services.dialogs.questions).toEqual([
      "Delete the activity “Gym”?\n\nThis also removes it from each day on which it is recorded. A goal linked to it stays, without an associated activity. You cannot recover a deleted activity. To hide the activity and keep its history, archive it instead.",
    ]);
    expect(logic.state.notice).toEqual({ kind: "success", text: "Deleted." });
    expect(logic.state.activities).toHaveLength(11);
    expect(
      logic.state.goals.find((goal) => goal.id === "goal-move")?.activityId,
    ).toEqual(null);
    expect(
      (
        await backend.db
          .selectFrom("entryActivities")
          .select("activityId")
          .execute()
      ).map((row) => row.activityId),
    ).toEqual(["activity-walk"]);
  });

  it("should count the activities of a group in the warning", async () => {
    const { logic, frontend } = await setupTest();
    await logic.load();

    await logic.remove({ kind: "group", id: "group-home", name: "Home" });

    expect(frontend.services.dialogs.questions[0]).toEqual(
      "Delete the activity group “Home”?\n\nThis also deletes its 2 activities and removes them from each day on which they are recorded. A goal linked to a deleted activity stays, without an associated activity. You cannot recover a deleted group or its activities. To hide the group and keep its history, archive it instead.",
    );
    expect(logic.state.groups).toHaveLength(4);
    expect(logic.state.activities).toHaveLength(10);
  });

  it("should delete a goal with its history", async () => {
    const { logic, frontend } = await setupTest();
    await logic.load();

    await logic.remove({ kind: "goal", id: "goal-read", name: "Read" });

    expect(frontend.services.dialogs.questions[0]).toContain(
      "Delete the goal “Read”?",
    );
    expect(logic.state.goals.map((goal) => goal.id)).toEqual(["goal-move"]);
  });

  it("should keep the item when the owner does not agree", async () => {
    const { logic, frontend, transport } = await setupTest();
    await logic.load();
    frontend.services.dialogs.answerWith(false);
    transport.failNextRequestAtGateway(503);

    await logic.remove({ kind: "group", id: "group-people", name: "People" });

    expect(logic.state.groups).toHaveLength(5);
    expect(logic.state.notice).toEqual(null);
  });

  it("should keep the item and say why when the server refuses", async () => {
    const { logic, backend } = await setupTest();
    await logic.load();
    await backend.logic.catalog.deleteActivity({ id: "activity-gym" });

    await logic.remove({ kind: "activity", id: "activity-gym", name: "Gym" });

    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Activity not found.",
    });
    expect(logic.state.pendingKeys).toEqual([]);
  });

  it("should wait while the same item changes or the list moves", async () => {
    const { logic, frontend, transport } = await setupTest();
    await logic.load();
    const held = transport.holdNextRequest();

    const archiving = logic.archive({
      kind: "activity",
      id: "activity-gym",
      archived: false,
    });
    await held.reached;
    await logic.remove({ kind: "activity", id: "activity-gym", name: "Gym" });
    held.release();
    await archiving;

    expect(frontend.services.dialogs.questions).toEqual([]);
  });

  it("should say that the refresh failed when the item was deleted", async () => {
    const { logic, transport } = await setupTest();
    await logic.load();
    const held = transport.holdNextResponse();

    const removing = logic.remove({
      kind: "goal",
      id: "goal-read",
      name: "Read",
    });
    await held.reached;
    transport.goOffline();
    held.release();
    await removing;

    expect(logic.state.notice?.text).toContain(
      "Deleted, but setup refresh failed; refresh the page.",
    );
  });
});

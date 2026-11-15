import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import { CatalogSetupLogic } from "./catalog-setup-logic.js";

function setupTest() {
  return setupLogicTest({}, async (app) => {
    await app.backend.logic.catalog.read();
    return new CatalogSetupLogic(app.frontend);
  });
}

describe("CatalogSetupLogic renaming", () => {
  it("should rename an activity with the name that the owner types", async () => {
    const { logic, frontend, backend } = await setupTest();
    await logic.load();
    frontend.services.dialogs.answerTextWith("  Lifting ");

    await logic.rename({
      kind: "activity",
      id: "activity-gym",
      current: "Gym",
    });

    expect(frontend.services.dialogs.prompts).toEqual([
      { question: "New name", initial: "Gym" },
    ]);
    expect(
      logic.state.activities.find((a) => a.id === "activity-gym")?.name,
    ).toEqual("Lifting");
    expect(logic.state.overrides).toEqual({});
    expect(logic.state.notice).toEqual({
      kind: "success",
      text: "Setup updated.",
    });
    expect(
      (
        await backend.db
          .selectFrom("activities")
          .select("name")
          .where("id", "=", "activity-gym")
          .executeTakeFirst()
      )?.name,
    ).toEqual("Lifting");
  });

  it("should rename a group", async () => {
    const { logic, frontend } = await setupTest();
    await logic.load();
    frontend.services.dialogs.answerTextWith("Free time");

    await logic.rename({
      kind: "group",
      id: "group-leisure",
      current: "Leisure",
    });

    expect(logic.state.groups.map((group) => group.name)).toContain(
      "Free time",
    );
  });

  it("should keep the name when the owner cancels, types spaces, or types the same name", async () => {
    const { logic, frontend, transport } = await setupTest();
    await logic.load();
    transport.failNextRequestAtGateway(503);

    frontend.services.dialogs.answerTextWith(null);
    await logic.rename({
      kind: "activity",
      id: "activity-gym",
      current: "Gym",
    });
    frontend.services.dialogs.answerTextWith("   ");
    await logic.rename({
      kind: "activity",
      id: "activity-gym",
      current: "Gym",
    });
    frontend.services.dialogs.answerTextWith("Gym");
    await logic.rename({
      kind: "activity",
      id: "activity-gym",
      current: "Gym",
    });

    // No request was sent, so the failure waits for this one.
    expect(logic.state.notice).toEqual(null);
    expect(await logic.load()).toEqual(false);
  });

  it("should show the new name at once, and put the old one back when the server refuses", async () => {
    const { logic, frontend, transport, backend } = await setupTest();
    await logic.load();
    frontend.services.dialogs.answerTextWith("Lifting");
    const held = transport.holdNextRequest();

    const renaming = logic.rename({
      kind: "activity",
      id: "activity-gym",
      current: "Gym",
    });
    await held.reached;
    expect(logic.state.overrides).toEqual({
      "activity:activity-gym": { name: "Lifting" },
    });
    expect(logic.isPending("catalog:activity:activity-gym")).toEqual(true);
    await backend.logic.catalogChange.deleteActivity({ id: "activity-gym" });
    held.release();
    await renaming;

    expect(logic.state.overrides).toEqual({});
    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Activity not found.",
    });
    expect(logic.state.pendingKeys).toEqual([]);
  });

  it("should keep the change on screen and say so when the refresh fails", async () => {
    const { logic, frontend, transport } = await setupTest();
    await logic.load();
    frontend.services.dialogs.answerTextWith("Lifting");
    const held = transport.holdNextResponse();

    const renaming = logic.rename({
      kind: "activity",
      id: "activity-gym",
      current: "Gym",
    });
    await held.reached;
    transport.goOffline();
    held.release();
    await renaming;

    expect(logic.state.notice?.text).toContain(
      "Saved, but setup refresh failed. The change is still shown; try refreshing again.",
    );
    expect(logic.state.overrides).toEqual({
      "activity:activity-gym": { name: "Lifting" },
    });
  });
});

describe("CatalogSetupLogic moving and archiving", () => {
  it("should move an activity to another group", async () => {
    const { logic } = await setupTest();
    await logic.load();

    await logic.moveToGroup({ id: "activity-walk", groupId: "group-work" });

    expect(
      logic.state.activities.find((a) => a.id === "activity-walk")?.groupId,
    ).toEqual("group-work");
  });

  it("should refuse a move to a group that does not exist, and put the activity back", async () => {
    const { logic } = await setupTest();
    await logic.load();

    await logic.moveToGroup({ id: "activity-walk", groupId: "group-missing" });

    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Choose an activity group.",
    });
    expect(logic.state.overrides).toEqual({});
  });

  it("should archive and restore a group, an activity and a goal", async () => {
    const { logic } = await setupTest();
    await logic.load();

    await logic.archive({ kind: "group", id: "group-work", archived: false });
    expect(logic.state.notice?.text).toEqual("Archived.");
    await logic.archive({
      kind: "activity",
      id: "activity-walk",
      archived: false,
    });
    await logic.archive({ kind: "goal", id: "goal-read", archived: false });
    expect(
      logic.state.groups.find((g) => g.id === "group-work")?.archived,
    ).toEqual(true);
    expect(
      logic.state.goals.find((g) => g.id === "goal-read")?.archived,
    ).toEqual(true);

    await logic.archive({ kind: "group", id: "group-work", archived: true });

    expect(logic.state.notice?.text).toEqual("Restored.");
    expect(
      logic.state.groups.find((g) => g.id === "group-work")?.archived,
    ).toEqual(false);
  });
});

describe("CatalogSetupLogic changing an icon", () => {
  const target = { id: "activity-walk", name: "Walk", icon: "directions_walk" };

  it("should change the icon, and close the dialog when it is stored", async () => {
    const { logic, backend } = await setupTest();
    await logic.load();
    logic.openIconPicker({ target });
    expect(logic.state.iconTarget).toEqual(target);

    await logic.chooseIcon({ icon: "pool" });

    expect(logic.state.iconTarget).toEqual(null);
    expect(
      logic.state.activities.find((a) => a.id === "activity-walk")?.icon,
    ).toEqual("pool");
    expect(
      (
        await backend.db
          .selectFrom("activities")
          .select("materialIcon")
          .where("id", "=", "activity-walk")
          .executeTakeFirst()
      )?.materialIcon,
    ).toEqual("pool");
  });

  it("should close the dialog and send nothing for the icon that the activity has", async () => {
    const { logic, transport } = await setupTest();
    await logic.load();
    logic.openIconPicker({ target });
    transport.failNextRequestAtGateway(503);

    await logic.chooseIcon({ icon: "directions_walk" });

    expect(logic.state.iconTarget).toEqual(null);
    expect(logic.state.notice).toEqual(null);
  });

  it("should close the dialog that has no activity", async () => {
    const { logic } = await setupTest();

    await logic.chooseIcon({ icon: "pool" });

    expect(logic.state.iconTarget).toEqual(null);
  });

  it("should keep the dialog open when the icon is not stored", async () => {
    const { logic, transport } = await setupTest();
    await logic.load();
    logic.openIconPicker({ target });
    transport.goOffline();

    await logic.chooseIcon({ icon: "pool" });

    expect(logic.state.iconTarget).toEqual(target);
    expect(logic.state.overrides).toEqual({});
  });

  it("should close the dialog without a change", async () => {
    const { logic } = await setupTest();
    logic.openIconPicker({ target });

    logic.closeIconPicker();

    expect(logic.state.iconTarget).toEqual(null);
  });
});

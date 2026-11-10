import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { CatalogEvent, NoticeTarget } from "../types.js";
import { AddActivityLogic } from "./add-activity-logic.js";

function setupTest({
  requestedGroupId = "group-health",
  returnTo = "log",
  ...params
}: LogicTestParams & {
  requestedGroupId?: string | undefined;
  returnTo?: NoticeTarget;
} = {}) {
  return setupLogicTest(params, async (app) => {
    await app.backend.logic.catalog.read();
    return new AddActivityLogic({
      ...app.frontend,
      requestedGroupId,
      returnTo,
    });
  });
}

describe("AddActivityLogic", () => {
  it("should open on the group from the address", async () => {
    const { logic } = await setupTest({ requestedGroupId: "group-work" });

    expect(logic.groupId).toEqual("group-work");
    expect(logic.state.groups).toHaveLength(5);
    expect(logic.state.icon).toEqual("category");
  });

  it("should fall back to the first active group", async () => {
    const { logic, backend } = await setupTest({ skipInitialization: true });
    await backend.logic.catalogChange.updateGroup({
      id: "group-health",
      patch: { archived: true },
    });
    await logic.initialize();

    expect(logic.groupId).toEqual("group-work");
    logic.chooseGroup({ groupId: "group-people" });
    expect(logic.groupId).toEqual("group-people");
  });

  it("should add the activity to the group, and tell the page that opened the form", async () => {
    const { logic, frontend, backend } = await setupTest();
    const events: CatalogEvent[] = [];
    frontend.catalogEvents.listen((event) => {
      events.push(event);
    });
    logic.setName({ name: "  Swimming " });
    logic.openIconPicker();
    expect(logic.state.iconPickerOpen).toEqual(true);
    logic.chooseIcon({ icon: "pool" });
    expect(logic.state.iconPickerOpen).toEqual(false);

    expect(await logic.add()).toEqual(true);

    expect(events).toEqual([
      {
        type: "catalogChanged",
        notice: { target: "log", text: "Activity added." },
      },
    ]);
    expect(logic.state.adding).toEqual(false);
    expect(
      await backend.db
        .selectFrom("activities")
        .select(["name", "groupId", "materialIcon"])
        .where("name", "=", "Swimming")
        .execute(),
    ).toEqual([
      { name: "Swimming", groupId: "group-health", materialIcon: "pool" },
    ]);
  });

  it("should name the Setup page as the one to return to", async () => {
    const { logic, frontend } = await setupTest({ returnTo: "settings" });
    const events: CatalogEvent[] = [];
    frontend.catalogEvents.listen((event) => {
      events.push(event);
    });
    logic.setName({ name: "Neighbours" });
    logic.chooseGroup({ groupId: "group-people" });

    await logic.add();

    expect(events[0]).toMatchObject({
      notice: { target: "settings", text: "Activity added." },
    });
  });

  it("should close the icon dialog without a change", async () => {
    const { logic } = await setupTest();
    logic.openIconPicker();

    logic.closeIconPicker();

    expect(logic.state.iconPickerOpen).toEqual(false);
    expect(logic.state.icon).toEqual("category");
  });

  it("should refuse a name that has only spaces", async () => {
    const { logic, backend } = await setupTest();
    logic.setName({ name: "   " });

    expect(await logic.add()).toEqual(false);

    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Activity name is required.",
    });
    expect(
      await backend.db.selectFrom("activities").select("id").execute(),
    ).toHaveLength(12);
  });

  it("should ask for a group when every group is archived", async () => {
    const { logic, backend } = await setupTest({ skipInitialization: true });
    await backend.db
      .updateTable("activityGroups")
      .set({ archivedAt: "2026-01-01T00:00:00.000Z" })
      .execute();
    await logic.initialize();
    logic.setName({ name: "Yoga" });

    expect(await logic.add()).toEqual(false);

    expect(logic.state.notice?.text).toEqual(
      "Create an active activity group before adding an activity.",
    );
  });

  it("should not add while the device is offline", async () => {
    const { logic, frontend } = await setupTest();
    logic.setName({ name: "Yoga" });
    frontend.services.device.setOnline(false);

    expect(await logic.add()).toEqual(false);

    expect(logic.state.notice?.text).toEqual(
      "You’re offline. Reconnect before adding an activity.",
    );
  });

  it("should keep the form and say why when the server refuses", async () => {
    const { logic, backend } = await setupTest();
    logic.setName({ name: "Yoga" });
    await backend.logic.catalogChange.deleteGroup({ id: "group-health" });

    expect(await logic.add()).toEqual(false);

    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Choose an activity group.",
    });
    expect(logic.state.adding).toEqual(false);
    expect(logic.state.name).toEqual("Yoga");
  });

  it("should not let the owner leave, or add again, while the activity is added", async () => {
    const { logic, transport, backend } = await setupTest();
    logic.setName({ name: "Yoga" });
    expect(logic.canLeave()).toEqual(true);
    const held = transport.holdNextRequest();

    const adding = logic.add();
    await held.reached;
    expect(logic.canLeave()).toEqual(false);
    expect(logic.state.notice?.kind).toEqual("info");
    expect(await logic.add()).toEqual(false);
    held.release();
    await adding;

    expect(
      await backend.db
        .selectFrom("activities")
        .select("id")
        .where("name", "=", "Yoga")
        .execute(),
    ).toHaveLength(1);
  });
});

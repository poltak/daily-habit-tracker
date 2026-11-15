import { describe, expect, it } from "vitest";
import { AddActivityLogic } from "../../catalog/ui/add-activity-logic.js";
import { CatalogSetupLogic } from "../../catalog/ui/catalog-setup-logic.js";
import { ExportLogic } from "../../settings/ui/export-logic.js";
import { WeekLogic } from "../../settings/ui/week-logic.js";
import { setupLogicTest } from "../tests/full-application.js";
import { NavigationLockLogic } from "./navigation-lock-logic.js";
import { PageNoticeLogic } from "./page-notice-logic.js";

function setupTest() {
  return setupLogicTest(
    {},
    (app) =>
      new PageNoticeLogic({
        storage: {},
        services: {},
        api: {},
        pageNoticeEvents: app.frontend.pageNoticeEvents,
      }),
  );
}

type App = Awaited<ReturnType<typeof setupTest>>;

async function newWeek(app: App) {
  const week = new WeekLogic(app.frontend);
  await week.initialize();
  return week;
}

describe("PageNoticeLogic", () => {
  it("should show the message that a page sends", async () => {
    const app = await setupTest();
    const { logic } = app;
    logic.openView({ view: "settings" });
    expect(logic.state.notice).toEqual(null);
    const week = await newWeek(app);

    await week.changeWeekEnd({ weekEndsOn: 3 });

    expect(logic.state.notice).toEqual({
      kind: "success",
      text: "Weeks now run Thursday–Wednesday.",
    });
  });

  it("should replace the message with a newer one from another page", async () => {
    const app = await setupTest();
    const { logic, frontend } = app;
    logic.openView({ view: "settings" });
    const week = await newWeek(app);
    const download = new ExportLogic(frontend);
    await download.initialize();
    await week.changeWeekEnd({ weekEndsOn: 3 });

    await download.download();

    expect(logic.state.notice).toEqual({
      kind: "success",
      text: "Export downloaded.",
    });
  });

  it("should empty the slot when the owner opens another page", async () => {
    const app = await setupTest();
    const { logic } = app;
    logic.openView({ view: "settings" });
    const week = await newWeek(app);
    await week.changeWeekEnd({ weekEndsOn: 3 });
    expect(logic.state.notice).not.toEqual(null);

    logic.openView({ view: "calendar" });

    expect(logic.state.notice).toEqual(null);
  });

  it("should keep a message that is for the page that opens next, and drop it for another page", async () => {
    const app = await setupTest();
    const { logic, frontend } = app;
    const setup = new CatalogSetupLogic(frontend);
    await setup.initialize();
    const form = new AddActivityLogic({
      ...frontend,
      requestedGroupId: "group-health",
      returnTo: "settings",
    });
    await form.initialize();
    logic.openView({ view: "add-activity" });
    form.setName({ name: "Swimming" });
    expect(await form.add()).toEqual(true);
    expect(logic.state.notice).toEqual({
      kind: "success",
      text: "Activity added.",
    });

    logic.openView({ view: "settings" });
    expect(logic.state.notice).toEqual({
      kind: "success",
      text: "Activity added.",
    });

    logic.openView({ view: "log" });
    expect(logic.state.notice).toEqual(null);
  });

  it("should drop a message for the page that opens next when another page opens", async () => {
    const app = await setupTest();
    const { logic, frontend } = app;
    const setup = new CatalogSetupLogic(frontend);
    await setup.initialize();
    const form = new AddActivityLogic({
      ...frontend,
      requestedGroupId: "group-health",
      returnTo: "settings",
    });
    await form.initialize();
    logic.openView({ view: "add-activity" });
    form.setName({ name: "Swimming" });
    await form.add();

    logic.openView({ view: "calendar" });

    expect(logic.state.notice).toEqual(null);
  });

  it("should show why the owner cannot leave a page", async () => {
    const { logic, frontend } = await setupTest();
    logic.openView({ view: "settings" });
    const lock = new NavigationLockLogic(frontend);
    await lock.initialize();
    await frontend.navigationLockEvents.emit({
      type: "held",
      holder: "setup-page",
      reason: "setup",
    });

    expect(lock.canLeave()).toEqual(false);

    expect(logic.state.notice).toEqual({
      kind: "info",
      text: "Wait for the setup update to finish before leaving setup.",
    });
  });
});

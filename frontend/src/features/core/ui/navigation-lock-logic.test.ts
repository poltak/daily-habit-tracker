import { describe, expect, it } from "vitest";
import { PasskeysLogic } from "../../auth/ui/passkeys-logic.js";
import { AddActivityLogic } from "../../catalog/ui/add-activity-logic.js";
import { CatalogSetupLogic } from "../../catalog/ui/catalog-setup-logic.js";
import { GoalSetupLogic } from "../../catalog/ui/goal-setup-logic.js";
import { ExportLogic } from "../../settings/ui/export-logic.js";
import { WeekLogic } from "../../settings/ui/week-logic.js";
import {
  setupLogicTest,
  type TestDatabase,
} from "../tests/full-application.js";
import { NavigationLockLogic } from "./navigation-lock-logic.js";

const GOAL_MESSAGE =
  "Wait for the goal update to finish before leaving this goal.";
const SETUP_MESSAGE =
  "Wait for the setup update to finish before leaving setup.";
const ACTIVITY_MESSAGE =
  "Wait for the activity update to finish before leaving this view.";

function setupTest() {
  return setupLogicTest({}, async (app) => {
    await app.backend.logic.catalog.read();
    return new NavigationLockLogic(app.frontend);
  });
}

type App = Awaited<ReturnType<typeof setupTest>>;

async function goalName(db: TestDatabase) {
  return (
    await db
      .selectFrom("goals")
      .select("name")
      .where("id", "=", "goal-read")
      .executeTakeFirst()
  )?.name;
}

async function newGoal(app: App) {
  const goal = new GoalSetupLogic({
    ...app.frontend,
    goalId: "goal-read",
    returnTo: "settings",
  });
  await goal.initialize();
  return goal;
}

/** The lock holds, and the owner reads why, until the request ends. */
function expectLocked({
  lock,
  app,
  message,
}: {
  lock: NavigationLockLogic;
  app: App;
  message: string;
}) {
  expect(lock.locked).toEqual(true);
  expect(lock.canLeave()).toEqual(false);
  expect(lock.state.notice).toEqual({ kind: "info", text: message });
  expect(app.frontend.services.history.goBack()).toEqual(false);
}

function expectUnlocked({
  lock,
  app,
}: {
  lock: NavigationLockLogic;
  app: App;
}) {
  expect(lock.locked).toEqual(false);
  expect(lock.state.notice).toEqual(null);
  expect(lock.canLeave()).toEqual(true);
  expect(app.frontend.services.history.goBack()).toEqual(true);
}

describe("NavigationLockLogic", () => {
  it("should keep the owner on the goal while its update runs", async () => {
    const app = await setupTest();
    const { logic: lock, transport, backend } = app;
    const goal = await newGoal(app);
    goal.setName({ name: "Read more" });
    expectUnlocked({ lock, app });
    const held = transport.holdNextRequest();

    const saving = goal.save();
    await held.reached;

    expectLocked({ lock, app, message: GOAL_MESSAGE });
    expect(await goalName(backend.db)).toEqual("Read");
    held.release();
    await saving;
    expectUnlocked({ lock, app });
    expect(await goalName(backend.db)).toEqual("Read more");
  });

  it("should keep the owner on the form while the activity is added", async () => {
    const app = await setupTest();
    const { logic: lock, transport, backend } = app;
    const form = new AddActivityLogic({
      ...app.frontend,
      requestedGroupId: "group-health",
      returnTo: "settings",
    });
    await form.initialize();
    form.setName({ name: "Yoga" });
    const count = async () =>
      (
        await backend.db
          .selectFrom("activities")
          .select("id")
          .where("name", "=", "Yoga")
          .execute()
      ).length;
    expectUnlocked({ lock, app });
    const held = transport.holdNextRequest();

    const adding = form.add();
    await held.reached;

    expectLocked({ lock, app, message: ACTIVITY_MESSAGE });
    expect(await count()).toEqual(0);
    held.release();
    await adding;
    expectUnlocked({ lock, app });
    expect(await count()).toEqual(1);
  });

  it("should keep the owner on Setup while a change of the catalog runs", async () => {
    const app = await setupTest();
    const { logic: lock, transport, backend } = app;
    const setup = new CatalogSetupLogic(app.frontend);
    await setup.initialize();
    setup.setNewGroupName({ name: "Travel" });
    const count = async () =>
      (await backend.db.selectFrom("activityGroups").select("id").execute())
        .length;
    expectUnlocked({ lock, app });
    const held = transport.holdNextRequest();

    const creating = setup.createGroup();
    await held.reached;

    expectLocked({ lock, app, message: SETUP_MESSAGE });
    expect(await count()).toEqual(5);
    held.release();
    await creating;
    expectUnlocked({ lock, app });
    expect(await count()).toEqual(6);
  });

  it("should keep the owner on Setup while the week is saved", async () => {
    const app = await setupTest();
    const { logic: lock, transport, backend } = app;
    const week = new WeekLogic(app.frontend);
    await week.initialize();
    expectUnlocked({ lock, app });
    const held = transport.holdNextRequest();

    const saving = week.changeWeekEnd({ weekEndsOn: 6 });
    await held.reached;

    expectLocked({ lock, app, message: SETUP_MESSAGE });
    expect(
      await backend.db.selectFrom("appSettings").selectAll().execute(),
    ).toEqual([]);
    held.release();
    await saving;
    expectUnlocked({ lock, app });
    expect(
      await backend.db.selectFrom("appSettings").selectAll().execute(),
    ).toMatchObject([{ key: "week_ends_on", value: "6" }]);
  });

  it("should keep the owner on Setup while a passkey is removed", async () => {
    const app = await setupTest();
    const { logic: lock, transport, backend } = app;
    const passkeys = new PasskeysLogic(app.frontend);
    await passkeys.initialize();
    await passkeys.addPasskey();
    const other = passkeys.state.passkeys.find(({ current }) => !current);
    const count = async () =>
      (await backend.db.selectFrom("passkeys").select("id").execute()).length;
    expectUnlocked({ lock, app });
    const held = transport.holdNextRequest();

    const removing = passkeys.removePasskey({ id: other?.id ?? "" });
    await held.reached;

    expectLocked({ lock, app, message: SETUP_MESSAGE });
    expect(await count()).toEqual(2);
    held.release();
    await removing;
    expectUnlocked({ lock, app });
    expect(await count()).toEqual(1);
  });

  it("should keep the owner on Setup while the export downloads", async () => {
    const app = await setupTest();
    const { logic: lock, transport, frontend } = app;
    const download = new ExportLogic(frontend);
    await download.initialize();
    expectUnlocked({ lock, app });
    const held = transport.holdNextRequest();

    const exporting = download.download();
    await held.reached;

    expectLocked({ lock, app, message: SETUP_MESSAGE });
    expect(frontend.services.downloads.files).toEqual([]);
    held.release();
    await exporting;
    expectUnlocked({ lock, app });
    expect(frontend.services.downloads.files).toHaveLength(1);
  });

  it("should unlock when the update fails", async () => {
    const app = await setupTest();
    const { logic: lock, transport, backend } = app;
    const goal = await newGoal(app);
    goal.setName({ name: "Read more" });
    const held = transport.holdNextRequest();
    const saving = goal.save();
    await held.reached;
    await backend.logic.catalogChange.deleteGoal({ id: "goal-read" });

    held.release();
    await saving;

    expect(goal.state.notice?.kind).toEqual("error");
    expectUnlocked({ lock, app });
  });

  it("should unlock when the busy page is cleaned up", async () => {
    const app = await setupTest();
    const { logic: lock, transport } = app;
    const goal = await newGoal(app);
    goal.setName({ name: "Read more" });
    const held = transport.holdNextRequest();
    const saving = goal.save();
    await held.reached;
    expect(lock.locked).toEqual(true);

    await goal.cleanup();

    expectUnlocked({ lock, app });
    held.release();
    await saving;
  });

  it("should stay locked until both holders are done", async () => {
    const app = await setupTest();
    const { logic: lock, transport, frontend } = app;
    const goal = await newGoal(app);
    goal.setName({ name: "Read more" });
    const download = new ExportLogic(frontend);
    await download.initialize();
    const goalHeld = transport.holdNextRequest();
    const saving = goal.save();
    await goalHeld.reached;
    const exportHeld = transport.holdNextRequest();
    const exporting = download.download();
    await exportHeld.reached;
    expectLocked({ lock, app, message: SETUP_MESSAGE });

    goalHeld.release();
    await saving;

    expectLocked({ lock, app, message: SETUP_MESSAGE });
    exportHeld.release();
    await exporting;
    expectUnlocked({ lock, app });
  });
});

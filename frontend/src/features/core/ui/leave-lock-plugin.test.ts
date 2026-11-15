import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../tests/full-application.js";
import type { NavigationLockEvent } from "../types.js";
import { LeaveLockPlugin } from "./leave-lock-plugin.js";

function setupTest() {
  return setupLogicTest({}, (app) => {
    const events: NavigationLockEvent[] = [];
    app.frontend.navigationLockEvents.listen((event) => {
      events.push(event);
    });
    const plugin = new LeaveLockPlugin({
      navigationLockEvents: app.frontend.navigationLockEvents,
      reason: "goal",
    });
    return Object.assign(plugin, { sent: events });
  });
}

describe("LeaveLockPlugin", () => {
  it("should tell the shell when the Logic becomes busy and when it is done", async () => {
    const { logic } = await setupTest();
    expect(logic.sent).toEqual([]);

    logic.update({ busy: true });
    logic.update({ busy: true });
    expect(logic.sent).toMatchObject([{ type: "held", reason: "goal" }]);
    expect(logic.state.held).toEqual(true);
    logic.update({ busy: false });
    logic.update({ busy: false });

    const [held, released] = logic.sent;
    expect(logic.sent).toHaveLength(2);
    expect(released).toEqual({ type: "released", holder: held?.holder });
    expect(logic.state.held).toEqual(false);
  });

  it("should let go when the Logic is cleaned up while it is busy", async () => {
    const { logic } = await setupTest();
    logic.update({ busy: true });

    await logic.cleanup();

    expect(logic.sent.map((event) => event.type)).toEqual(["held", "released"]);
  });

  it("should send nothing when the Logic is cleaned up and not busy", async () => {
    const { logic } = await setupTest();

    await logic.cleanup();

    expect(logic.sent).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../tests/full-application.js";
import type { PageNoticeEvent } from "../types.js";
import { PageNoticePlugin } from "./page-notice-plugin.js";

function setupTest() {
  return setupLogicTest({}, (app) => {
    const events: PageNoticeEvent[] = [];
    app.frontend.pageNoticeEvents.listen((event) => {
      events.push(event);
    });
    const plugin = new PageNoticePlugin({
      pageNoticeEvents: app.frontend.pageNoticeEvents,
    });
    return Object.assign(plugin, { sent: events });
  });
}

const SAVED = { kind: "success", text: "Saved." } as const;

describe("PageNoticePlugin", () => {
  it("should send a notice, with the page that shows it", async () => {
    const { logic } = await setupTest();

    logic.show({ notice: SAVED });
    logic.show({ notice: SAVED, view: "settings" });

    expect(logic.sent).toEqual([
      { type: "shown", notice: SAVED },
      { type: "shown", notice: SAVED, view: "settings" },
    ]);
    expect(logic.state.shown).toEqual(SAVED);
  });

  it("should send a clear", async () => {
    const { logic } = await setupTest();
    logic.show({ notice: SAVED });

    logic.clear();

    expect(logic.sent.at(-1)).toEqual({ type: "cleared" });
    expect(logic.state.shown).toEqual(null);
  });

  it("should show a followed notice once, and leave the slot when the notice is removed", async () => {
    const { logic } = await setupTest();
    const notice = { kind: "error", text: "No." } as const;

    logic.follow({ notice });
    logic.follow({ notice });
    logic.follow({ notice: null });
    logic.clear();
    logic.follow({ notice });
    logic.follow({ notice: { ...notice } });

    expect(logic.sent.map((event) => event.type)).toEqual([
      "shown",
      "cleared",
      "shown",
    ]);
  });
});

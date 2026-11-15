import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import { ThemeLogic } from "./theme-logic.js";

function setupTest() {
  return setupLogicTest({}, (app) => new ThemeLogic(app.frontend));
}

describe("ThemeLogic tests", () => {
  it("should follow the device when no choice was made", async () => {
    const { logic, frontend } = await setupTest();

    expect(logic.state.preference).toEqual("system");
    expect(frontend.services.theme.applied).toEqual(["system"]);
  });

  it.each(["light", "dark", "system"] as const)(
    "should apply the %s choice and keep it under the key of the old app",
    async (preference) => {
      const { logic, frontend } = await setupTest();

      logic.select({ preference });

      expect(logic.state.preference).toEqual(preference);
      expect(frontend.services.theme.applied.at(-1)).toEqual(preference);
      expect(frontend.browserStorage.getItem("daymark-theme")).toEqual(
        preference,
      );
    },
  );

  it("should read the saved choice after a reload", async () => {
    const { frontend } = await setupTest();
    frontend.browserStorage.setItem("daymark-theme", "dark");

    const later = new ThemeLogic(frontend);
    await later.initialize();

    expect(later.state.preference).toEqual("dark");
    expect(frontend.services.theme.applied.at(-1)).toEqual("dark");
  });

  it("should follow a choice that another tab made", async () => {
    const { logic, frontend } = await setupTest();
    frontend.browserStorage.setItem("daymark-theme", "dark");

    frontend.services.theme.changeInOtherTab({ key: "daymark-theme" });

    expect(logic.state.preference).toEqual("dark");
    expect(frontend.services.theme.applied.at(-1)).toEqual("dark");
  });

  it("should go back to the device theme when another tab clears the storage", async () => {
    const { logic, frontend } = await setupTest();
    logic.select({ preference: "dark" });
    frontend.browserStorage.removeItem("daymark-theme");

    frontend.services.theme.changeInOtherTab({ key: null });

    expect(logic.state.preference).toEqual("system");
    expect(frontend.services.theme.applied.at(-1)).toEqual("system");
  });

  it("should ignore a change of another key in another tab", async () => {
    const { logic, frontend } = await setupTest();
    logic.select({ preference: "dark" });
    frontend.browserStorage.setItem("daymark-theme", "light");
    const applied = frontend.services.theme.applied.length;

    frontend.services.theme.changeInOtherTab({ key: "other-key" });

    expect(logic.state.preference).toEqual("dark");
    expect(frontend.services.theme.applied).toHaveLength(applied);
  });

  it("should treat a saved value that is not a theme as the device choice", async () => {
    const { frontend } = await setupTest();
    frontend.browserStorage.setItem("daymark-theme", "purple");

    expect(new ThemeLogic(frontend).state.preference).toEqual("system");
  });
});

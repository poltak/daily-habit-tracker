import { describe, expect, it } from "vitest";
import { ACTIVITY_ICON_CHOICES } from "@app/common/features/catalog/utils/activity-icons";
import { setupLogicTest } from "../../core/tests/full-application.js";
import {
  ALL_CATEGORIES,
  ICON_CATEGORIES,
  IconPickerLogic,
  iconLabel,
} from "./icon-picker-logic.js";

function setupTest() {
  return setupLogicTest(
    {},
    () => new IconPickerLogic({ storage: {}, services: {}, api: {} }),
  );
}

describe("IconPickerLogic", () => {
  it("should list every icon, 120 at a time", async () => {
    const { logic } = await setupTest();

    expect(logic.matches()).toHaveLength(ACTIVITY_ICON_CHOICES.length);
    expect(logic.state.visibleLimit).toEqual(120);
    logic.showMore();

    expect(logic.state.visibleLimit).toEqual(240);
    expect(ICON_CATEGORIES[0]).toEqual(ALL_CATEGORIES);
    expect(ICON_CATEGORIES).toContain("Food");
  });

  it("should find icons by name, and begin at the first page again", async () => {
    const { logic } = await setupTest();
    logic.showMore();

    logic.setQuery({ query: " Pool " });

    expect(logic.state.visibleLimit).toEqual(120);
    const names = logic.matches().map((choice) => choice.name);
    expect(names).toContain("pool");
    expect(names).not.toContain("fitness_center");
    logic.setQuery({ query: "no icon has this name" });
    expect(logic.matches()).toEqual([]);
  });

  it("should list the icons of a category", async () => {
    const { logic } = await setupTest();
    logic.showMore();

    logic.chooseCategory({ category: "Food" });

    expect(logic.state.visibleLimit).toEqual(120);
    const names = logic.matches().map((choice) => choice.name);
    expect(names).toContain("restaurant");
    expect(names).not.toContain("fitness_center");
    logic.chooseCategory({ category: ALL_CATEGORIES });
    expect(logic.matches().length).toBeGreaterThan(names.length);
  });

  it("should write the words of an icon name", () => {
    expect(iconLabel("directions_walk")).toEqual("directions walk");
  });
});

import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import { ExportLogic } from "./export-logic.js";

function setupTest() {
  return setupLogicTest({}, (app) => new ExportLogic(app.frontend));
}

describe("ExportLogic", () => {
  it("should save the export file with its name", async () => {
    const { logic, frontend, backend } = await setupTest();
    await backend.logic.catalog.read();

    await logic.download();

    expect(logic.state).toMatchObject({
      exportState: "success",
      downloaded: true,
    });
    const [file] = frontend.services.downloads.files;
    expect(file?.filename).toEqual("daylio-clone-export.json");
    expect(JSON.parse((await file?.content.text()) ?? "{}")).toHaveProperty(
      "tables",
    );
  });

  it("should say so when the export fails, and save nothing", async () => {
    const { logic, frontend, transport } = await setupTest();
    transport.goOffline();

    await logic.download();

    expect(logic.state.exportError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    expect(logic.state.downloaded).toEqual(false);
    expect(frontend.services.downloads.files).toEqual([]);
  });
});

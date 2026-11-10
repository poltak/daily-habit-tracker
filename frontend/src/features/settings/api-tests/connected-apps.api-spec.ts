import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";
import { SetupPageObject } from "../black-box-tests/setup-page-object.js";

test.describe("connected apps", () => {
  test("should list the app that the owner allowed, and stop it when the owner disconnects it", async ({
    agent,
    ownerPage,
    ownerRequest,
    apiOrigin,
  }) => {
    const connections = await ownerRequest.get(
      `${apiOrigin}/api/auth/connections`,
    );
    expect(connections.status()).toBe(200);
    expect((await connections.json()).connections).toMatchObject([
      { name: "Black-box agent" },
    ]);

    const setup = new SetupPageObject(ownerPage);
    await setup.goto();
    ownerPage.once("dialog", (dialog) => void dialog.accept());
    const disconnect = ownerPage.getByRole("button", {
      name: "Disconnect Black-box agent",
      exact: true,
    });
    await expect(setup.noConnectedApps).toBeHidden();
    await disconnect.click();
    await expect(setup.noConnectedApps).toBeVisible();

    expect((await agent.send("tools/list")).status()).toBe(401);
    const after = await ownerRequest.get(`${apiOrigin}/api/auth/connections`);
    expect((await after.json()).connections).toEqual([]);
  });

  test("should remove a connection through the API once, and stop its token", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    const [connection] = (
      await (await ownerRequest.get(`${apiOrigin}/api/auth/connections`)).json()
    ).connections as Array<{ id: string }>;

    const removed = await ownerRequest.delete(
      `${apiOrigin}/api/auth/connections/${connection?.id}`,
    );
    expect(removed.status()).toBe(200);
    expect(await removed.json()).toEqual({ removed: true });
    const again = await ownerRequest.delete(
      `${apiOrigin}/api/auth/connections/${connection?.id}`,
    );
    expect(again.status()).toBe(404);

    expect((await agent.send("tools/list")).status()).toBe(401);
  });
});

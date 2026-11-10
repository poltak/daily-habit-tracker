import { Hono } from "hono";
import type { BackendLogic } from "../../core/types.js";

interface SettingsHandlerProps {
  logic: Pick<BackendLogic, "settings">;
}

/** The routes of `/api/settings`. */
export function createSettingsHandlers({ logic }: SettingsHandlerProps) {
  return new Hono().get("/", async (context) =>
    context.json(await logic.settings.read(), 200),
  );
}

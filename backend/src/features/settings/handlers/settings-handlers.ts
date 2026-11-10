import { Hono } from "hono";
import { z } from "zod";
import { isWeekday } from "@app/common/features/settings/utils/week";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";

/**
 * The old JSON: only `weekEndsOn`, a weekday from 0 to 6. A key that the app
 * does not know is refused, so a typo does not pass as a save.
 */
const patchSchema = z.strictObject(
  {
    weekEndsOn: z
      .number("Choose a weekday for the end of the week.")
      .refine(isWeekday, "Choose a weekday for the end of the week.")
      .optional(),
  },
  {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `Unsupported setting: ${issue.keys[0]}.`
        : "Settings changes must be an object.",
  },
);

interface SettingsHandlerProps {
  logic: Pick<BackendLogic, "settings">;
}

/** Mount it behind the session gate. */
export function createSettingsHandlers({ logic }: SettingsHandlerProps) {
  return new Hono()
    .get("/", async (context) =>
      context.json({ settings: await logic.settings.read() }, 200),
    )
    .patch("/", validator("json", patchSchema), async (context) =>
      context.json(
        {
          settings: await logic.settings.update({
            patch: context.req.valid("json"),
          }),
        },
        200,
      ),
    );
}

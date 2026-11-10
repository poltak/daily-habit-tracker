import { Hono } from "hono";
import { AppError } from "../../core/errors/app-error.js";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import {
  activityPatchSchema,
  anyItemParamSchema,
  createSchema,
  goalPatchSchema,
  groupPatchSchema,
  itemParamSchema,
  reorderSchema,
} from "./catalog-schemas.js";

interface CatalogHandlerProps {
  logic: Pick<BackendLogic, "catalog">;
}

function unsupportedKind(): never {
  throw new AppError({
    code: "INVALID_REQUEST",
    message: "Unsupported catalog item.",
  });
}

/**
 * The routes of `/api/catalog`, with the paths and the JSON of the old app.
 * An item has one route for each kind, and any other kind is refused.
 */
export function createCatalogHandlers({ logic }: CatalogHandlerProps) {
  const { catalog } = logic;
  return new Hono()
    .get("/", async (context) => context.json(await catalog.read(), 200))
    .post("/", validator("json", createSchema), async (context) => {
      const input = context.req.valid("json");
      if (input.kind === "group") {
        return context.json({ group: await catalog.createGroup(input) }, 201);
      }
      if (input.kind === "activity") {
        return context.json(
          { activity: await catalog.createActivity(input) },
          201,
        );
      }
      return context.json({ goal: await catalog.createGoal(input) }, 201);
    })
    .post("/reorder", validator("json", reorderSchema), async (context) => {
      await catalog.reorder(context.req.valid("json"));
      return context.json({ success: true }, 200);
    })
    .patch(
      "/group/:id",
      validator("param", itemParamSchema),
      validator("json", groupPatchSchema),
      async (context) =>
        context.json(
          {
            group: await catalog.updateGroup({
              ...context.req.valid("param"),
              patch: context.req.valid("json"),
            }),
          },
          200,
        ),
    )
    .patch(
      "/activity/:id",
      validator("param", itemParamSchema),
      validator("json", activityPatchSchema),
      async (context) =>
        context.json(
          {
            activity: await catalog.updateActivity({
              ...context.req.valid("param"),
              patch: context.req.valid("json"),
            }),
          },
          200,
        ),
    )
    .patch(
      "/goal/:id",
      validator("param", itemParamSchema),
      validator("json", goalPatchSchema),
      async (context) =>
        context.json(
          {
            goal: await catalog.updateGoal({
              ...context.req.valid("param"),
              patch: context.req.valid("json"),
            }),
          },
          200,
        ),
    )
    .patch("/:kind/:id", validator("param", anyItemParamSchema), () =>
      unsupportedKind(),
    )
    .delete(
      "/group/:id",
      validator("param", itemParamSchema),
      async (context) => {
        await catalog.deleteGroup(context.req.valid("param"));
        return context.json({ success: true }, 200);
      },
    )
    .delete(
      "/activity/:id",
      validator("param", itemParamSchema),
      async (context) => {
        await catalog.deleteActivity(context.req.valid("param"));
        return context.json({ success: true }, 200);
      },
    )
    .delete(
      "/goal/:id",
      validator("param", itemParamSchema),
      async (context) => {
        await catalog.deleteGoal(context.req.valid("param"));
        return context.json({ success: true }, 200);
      },
    )
    .delete("/:kind/:id", validator("param", anyItemParamSchema), () =>
      unsupportedKind(),
    );
}

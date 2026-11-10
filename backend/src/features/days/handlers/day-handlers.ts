import { Hono } from "hono";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import { normalizePage } from "../utils/paging.js";
import {
  activitySelectionParamSchema,
  activitySelectionSchema,
  calendarQuerySchema,
  dateParamSchema,
  deleteQuerySchema,
  entryInputSchema,
  moodSelectionSchema,
  pageQuerySchema,
} from "./day-schemas.js";

interface DayHandlerProps {
  logic: Pick<BackendLogic, "days">;
}

/** The routes of the entries, the day selections and the calendar. */
export function createDayHandlers({ logic }: DayHandlerProps) {
  return new Hono()
    .get("/entries", validator("query", pageQuerySchema), async (context) =>
      context.json(
        await logic.days.listEntries(normalizePage(context.req.valid("query"))),
        200,
      ),
    )
    .get(
      "/entries/:logicalDate",
      validator("param", dateParamSchema),
      async (context) => {
        const state = await logic.days.readDay(context.req.valid("param"));
        // A day without an entry answers 404 with the same body, which carries
        // the taps of the owner for that day.
        return context.json(state, state.entry ? 200 : 404);
      },
    )
    .put(
      "/entries/:logicalDate",
      validator("param", dateParamSchema),
      validator("json", entryInputSchema),
      async (context) =>
        context.json(
          {
            entry: await logic.days.saveEntry({
              ...context.req.valid("param"),
              input: context.req.valid("json"),
            }),
          },
          200,
        ),
    )
    .delete(
      "/entries/:logicalDate",
      validator("param", dateParamSchema),
      validator("query", deleteQuerySchema),
      async (context) => {
        const { expectedVersion } = context.req.valid("query");
        await logic.days.deleteEntry({
          ...context.req.valid("param"),
          expectedVersion:
            expectedVersion === undefined ? undefined : Number(expectedVersion),
        });
        return context.json({ entry: null }, 200);
      },
    )
    .put(
      "/day-selections/:logicalDate/mood",
      validator("param", dateParamSchema),
      validator("json", moodSelectionSchema),
      async (context) =>
        context.json(
          {
            selection: await logic.days.setMood({
              ...context.req.valid("param"),
              ...context.req.valid("json"),
            }),
          },
          200,
        ),
    )
    .put(
      "/day-selections/:logicalDate/activities/:activityId",
      validator("param", activitySelectionParamSchema),
      validator("json", activitySelectionSchema),
      async (context) =>
        context.json(
          await logic.days.setActivity({
            ...context.req.valid("param"),
            ...context.req.valid("json"),
          }),
          200,
        ),
    )
    .get(
      "/calendar",
      validator("query", calendarQuerySchema),
      async (context) =>
        context.json(
          {
            days: await logic.days.listCalendar({
              month: context.req.valid("query").month ?? "",
            }),
          },
          200,
        ),
    );
}

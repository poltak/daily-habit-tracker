import {
  addDays,
  monthDateRange,
} from "@app/common/features/core/utils/logical-date";
import { buildGoalHistory } from "@app/common/features/goals/utils/goal-history";
import { Hono } from "hono";
import { AppError } from "../../core/errors/app-error.js";
import { validator } from "../../core/handlers/validator.js";
import type { BackendLogic } from "../../core/types.js";
import {
  goalCompletionParamSchema,
  goalCompletionSchema,
  goalHistoryQuerySchema,
  goalParamSchema,
} from "./goal-schemas.js";

interface GoalHandlerProps {
  logic: Pick<BackendLogic, "catalog" | "days" | "settings">;
}

/**
 * The routes of the goal completions and of the history of a goal. They
 * combine the days, the catalog and the settings, so no Logic reads the
 * Storage of another feature.
 */
export function createGoalHandlers({ logic }: GoalHandlerProps) {
  return new Hono()
    .put(
      "/goal-completions/:logicalDate/:goalId",
      validator("param", goalCompletionParamSchema),
      validator("json", goalCompletionSchema),
      async (context) =>
        context.json(
          await logic.days.setGoalCompletion({
            ...context.req.valid("param"),
            ...context.req.valid("json"),
          }),
          200,
        ),
    )
    .get(
      "/goals/:goalId/history",
      validator("param", goalParamSchema),
      validator("query", goalHistoryQuerySchema),
      async (context) => {
        const { goalId } = context.req.valid("param");
        const { asOf, month } = context.req.valid("query");
        const goal = await logic.catalog.readGoal({ id: goalId });
        if (!goal) {
          throw new AppError({
            code: "INVALID_REQUEST",
            message: "Goal not found.",
          });
        }
        const { startDate, endDate } = monthDateRange(month);
        const [{ weekEndsOn }, completedDates, firstCompletedDate] =
          await Promise.all([
            logic.settings.read(),
            // The week rows reach up to six days outside the month.
            logic.days.listCompletionDates({
              goalId,
              startDate: addDays(startDate, -7),
              endDate: addDays(endDate, 7),
            }),
            logic.days.findFirstCompletionDate({ goalId }),
          ]);
        return context.json(
          buildGoalHistory({
            goal,
            startDate,
            endDate,
            completedDates,
            firstCompletedDate,
            weekEndsOn,
            asOf,
          }),
          200,
        );
      },
    );
}

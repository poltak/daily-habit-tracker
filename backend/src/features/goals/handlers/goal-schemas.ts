import {
  isLogicalDate,
  isMonth,
} from "@app/common/features/core/utils/logical-date";
import { z } from "zod";

export const goalCompletionParamSchema = z.object({
  logicalDate: z.string(),
  goalId: z.string(),
});

export const goalCompletionSchema = z.object({
  completed: z.boolean("Goal completion must be a boolean."),
});

export const goalParamSchema = z.object({ goalId: z.string() });

export const goalHistoryQuerySchema = z.object({
  asOf: z
    .string("Choose a valid current date.")
    .refine(isLogicalDate, "Choose a valid current date."),
  month: z
    .string("Choose a valid month.")
    .refine(isMonth, "Choose a valid month."),
});

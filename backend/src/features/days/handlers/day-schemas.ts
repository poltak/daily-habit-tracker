import { z } from "zod";

const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const dateParamSchema = z.object({ logicalDate: z.string() });

export const entryInputSchema = z.object({
  moodId: z.string(),
  activityIds: z.array(z.string()),
  completedGoalIds: z.array(z.string()),
  localTime: z
    .string()
    .regex(LOCAL_TIME, "Choose a valid entry time.")
    .optional(),
  timezone: z.string().optional(),
  timezoneOffsetMinutes: z.number().int().optional(),
  expectedVersion: z
    .number()
    .int()
    .min(0, "Expected version must be a non-negative integer.")
    .optional(),
  legacyNoteTitle: z.string().optional(),
  legacyNote: z.string().optional(),
});

export const deleteQuerySchema = z.object({
  expectedVersion: z
    .string()
    .regex(/^\d+$/, "Expected version must be a non-negative integer.")
    .optional(),
});

export const pageQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
});

export const calendarQuerySchema = z.object({ month: z.string().optional() });

export const moodSelectionSchema = z.object({ moodId: z.string() });

export const activitySelectionParamSchema = z.object({
  logicalDate: z.string(),
  activityId: z.string(),
});

export const activitySelectionSchema = z.object({ selected: z.boolean() });

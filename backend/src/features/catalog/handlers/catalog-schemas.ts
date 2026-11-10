import { z } from "zod";

const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (field: string) => z.string(`${field} must be a string.`);

const integer = (field: string) =>
  z
    .number(`${field} must be an integer.`)
    .refine(Number.isSafeInteger, `${field} must be an integer.`);

const flag = (field: string) => z.boolean(`${field} must be a boolean.`);

const reference = (field: string) =>
  text(field).refine(
    (value) => value.trim() !== "",
    `${field} must be a non-empty string.`,
  );

const reminderTime = z
  .string("reminderTime must be a string.")
  .refine(
    (value) => value === "" || LOCAL_TIME.test(value),
    "Choose a valid reminder time.",
  );

/** A change names fields of the item, and the old API refused any other key. */
function patchOf<Shape extends z.ZodRawShape>(kind: string, shape: Shape) {
  return z.strictObject(shape, {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `Unsupported ${kind} field: ${issue.keys[0]}.`
        : "Catalog changes must be an object.",
  });
}

export const groupPatchSchema = patchOf("group", {
  name: text("name").optional(),
  sortOrder: integer("sortOrder").optional(),
  archived: flag("archived").optional(),
});

export const activityPatchSchema = patchOf("activity", {
  name: text("name").optional(),
  groupId: reference("groupId").optional(),
  icon: text("icon").optional(),
  sortOrder: integer("sortOrder").optional(),
  archived: flag("archived").optional(),
});

export const goalPatchSchema = patchOf("goal", {
  name: text("name").optional(),
  activityId: reference("activityId").nullable().optional(),
  materialIcon: text("materialIcon").optional(),
  repeatType: text("repeatType").optional(),
  scheduleType: text("scheduleType").optional(),
  targetPerWeek: integer("targetPerWeek").nullable().optional(),
  weekdaysMask: integer("weekdaysMask").nullable().optional(),
  sortOrder: integer("sortOrder").optional(),
  archived: flag("archived").optional(),
  reminderEnabled: flag("reminderEnabled").optional(),
  reminderTime: reminderTime.optional(),
});

/** What a create carries. The fields that a kind does not use are ignored. */
export const createSchema = z.object(
  {
    kind: z.enum(["group", "activity", "goal"], "Unsupported catalog item."),
    name: text("name").optional(),
    groupId: reference("groupId").optional(),
    icon: text("icon").optional(),
    activityId: reference("activityId").nullable().optional(),
    materialIcon: text("materialIcon").optional(),
    repeatType: text("repeatType").optional(),
    scheduleType: text("scheduleType").optional(),
    targetPerWeek: integer("targetPerWeek").nullable().optional(),
    weekdaysMask: integer("weekdaysMask").nullable().optional(),
    startDate: text("startDate").optional(),
    reminderEnabled: flag("reminderEnabled").optional(),
    reminderTime: reminderTime.optional(),
  },
  { error: () => "JSON body must be an object." },
);

const sortValue = z
  .number("Sort values must be integers.")
  .refine(Number.isSafeInteger, "Sort values must be integers.");

export const itemParamSchema = z.object({ id: z.string() });

export const anyItemParamSchema = z.object({
  kind: z.string(),
  id: z.string(),
});

export const reorderSchema = z.object(
  {
    kind: z.enum(["group", "activity", "goal"], "Unsupported catalog item."),
    updates: z
      .array(
        z.object(
          {
            id: z
              .string("Reorder item IDs must be unique non-empty strings.")
              .refine(
                (value) => value.trim() !== "",
                "Reorder item IDs must be unique non-empty strings.",
              ),
            sortOrder: sortValue,
            expectedSortOrder: sortValue,
          },
          { error: () => "Invalid reorder item." },
        ),
        "Choose items to reorder.",
      )
      .min(1, "Choose items to reorder.")
      .refine(
        (updates) =>
          new Set(updates.map((update) => update.id)).size === updates.length,
        "Reorder item IDs must be unique non-empty strings.",
      ),
  },
  { error: () => "Reorder must be an object." },
);

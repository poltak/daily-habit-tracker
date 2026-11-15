import { isLogicalDate } from "@app/common/features/core/utils/logical-date";
import { DATE_PATTERN, type JsonSchema } from "./tool-definitions.js";

/** An error whose text an agent reads and acts on. Any other error is reported without detail. */
export class ToolInputError extends Error {}

const TYPE_NAMES: Record<string, string> = {
  array: "an array of strings",
};

function matchesType({ type, value }: { type: unknown; value: unknown }) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return (
        Array.isArray(value) && value.every((item) => typeof item === "string")
      );
    default:
      return false;
  }
}

/** Check the arguments against the input schema of the tool, so that the schema and the checks cannot drift apart. */
export function checkArguments({
  schema,
  args,
}: {
  schema: JsonSchema;
  args: unknown;
}): Record<string, unknown> {
  const given = args ?? {};
  if (typeof given !== "object" || Array.isArray(given)) {
    throw new ToolInputError("Arguments must be an object.");
  }
  const values = given as Record<string, unknown>;
  for (const key of Object.keys(values)) {
    if (!(key in schema.properties)) {
      throw new ToolInputError(
        `Unknown argument "${key}". Allowed: ${Object.keys(schema.properties).join(", ") || "none"}.`,
      );
    }
  }
  for (const key of schema.required ?? []) {
    if (values[key] === undefined) {
      throw new ToolInputError(`Missing required argument "${key}".`);
    }
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      continue;
    }
    const property = schema.properties[key] ?? {};
    const types = ([] as unknown[]).concat(property["type"] ?? []);
    if (!types.some((type) => matchesType({ type, value }))) {
      const names = types.map(
        (type) => TYPE_NAMES[String(type)] ?? `a ${String(type)}`,
      );
      throw new ToolInputError(
        `Argument "${key}" must be ${names.join(" or ")}.`,
      );
    }
    if (
      property["pattern"] === DATE_PATTERN &&
      typeof value === "string" &&
      !isLogicalDate(value)
    ) {
      throw new ToolInputError(
        `Argument "${key}" must be a real calendar date written YYYY-MM-DD.`,
      );
    }
    const allowed = property["enum"];
    if (Array.isArray(allowed) && !allowed.includes(value)) {
      throw new ToolInputError(
        `Argument "${key}" must be one of: ${allowed.join(", ")}.`,
      );
    }
    const minimum = property["minimum"];
    if (
      typeof minimum === "number" &&
      typeof value === "number" &&
      value < minimum
    ) {
      throw new ToolInputError(
        `Argument "${key}" must be at least ${minimum}.`,
      );
    }
  }
  return values;
}

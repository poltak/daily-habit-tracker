import {
  CURATED_ACTIVITY_ICON_CHOICES,
  type ActivityIconChoice,
} from "./curated-icons.js";
import { MATERIAL_SYMBOL_NAMES_1 } from "./material-symbol-names-1.js";
import { MATERIAL_SYMBOL_NAMES_2 } from "./material-symbol-names-2.js";
import { MATERIAL_SYMBOL_NAMES_3 } from "./material-symbol-names-3.js";
import { MATERIAL_SYMBOL_NAMES_4 } from "./material-symbol-names-4.js";

const curatedNames = new Set(
  CURATED_ACTIVITY_ICON_CHOICES.map((choice) => choice.name),
);

/** The curated icons first, then every other glyph of the font. */
export const ACTIVITY_ICON_CHOICES: readonly ActivityIconChoice[] = [
  ...CURATED_ACTIVITY_ICON_CHOICES,
  ...[
    MATERIAL_SYMBOL_NAMES_1,
    MATERIAL_SYMBOL_NAMES_2,
    MATERIAL_SYMBOL_NAMES_3,
    MATERIAL_SYMBOL_NAMES_4,
  ]
    .flatMap((names) => names.split(" "))
    .filter((name) => !curatedNames.has(name))
    .map((name) => ({ name, category: "All icons" as const })),
];

const activityIconNames = new Set(
  ACTIVITY_ICON_CHOICES.map((choice) => choice.name),
);

/** A goal takes the same icons as an activity. */
export function isActivityIcon(value: unknown): value is string {
  return typeof value === "string" && activityIconNames.has(value);
}

const KEYWORD_ICONS: [RegExp, string][] = [
  [
    /gym|workout|exercise|fitness|sport|run|swim|bike|cycling|squat|push-up|mobility|split|treadmill|sore muscle|injury|hike|garden|walk/,
    "fitness_center",
  ],
  [/sleep|nap|bed|rest|tired|insomnia/, "bedtime"],
  [
    /read|book|article|writing|write|paper|draw|calligraphy|chinese|nom/,
    "menu_book",
  ],
  [/music|song|ukulele|guitar|piano/, "music_note"],
  [/game|gaming|video game|football|watch(ed)? sport/, "sports_esports"],
  [/movie|film|tv|youtube|podcast|audiobook|cinema|netflix/, "movie"],
  [/cook|food|restaurant|cafe|chocolate|kefir|tea|coffee|sugar/, "restaurant"],
  [/clean|chore|wash|shower|bath|towel|house|home/, "cleaning_services"],
  [
    /family|wife|dad|friend|neighbou?r|people|convo|social|wedding|kids/,
    "groups",
  ],
  [
    /work|job|coding|code|leetcode|meeting|call|freelance|todo|research|logseq/,
    "work",
  ],
  [/anki|language|vietnamese|indonesian|class|learn|study|listening/, "school"],
  [
    /smok|vape|cigarette|alcohol|drink|substance|oil|micro|paracetamol|medicine|vit|supplement/,
    "medication",
  ],
  [
    /meditat|mindful|nsdr|wimhoff|health podcast|fast|avoid|no /,
    "self_improvement",
  ],
  [
    /travel|trip|plane|train|motorbike|van|beach|hotel|city|camp|picnic/,
    "travel_explore",
  ],
  [/shop|shopping|money|trading|finance/, "shopping_bag"],
  [/panic|frustrat|bad|awful|sad|fun|achiev|think|emotion/, "psychology"],
];

/**
 * The Material Symbols Rounded name for an activity. A stored name wins. An
 * activity from a Daylio backup keeps only a number as its icon, so the
 * keywords of its name pick one.
 */
export function iconForActivity({
  name,
  sourceIconId,
}: {
  name: string;
  sourceIconId?: string | undefined;
}): string {
  if (
    sourceIconId &&
    sourceIconId !== "category" &&
    /[a-z_]/i.test(sourceIconId) &&
    !/^\d+$/.test(sourceIconId)
  ) {
    return sourceIconId;
  }
  const normalized = name.trim().toLowerCase();
  return (
    KEYWORD_ICONS.find(([pattern]) => pattern.test(normalized))?.[1] ??
    "category"
  );
}

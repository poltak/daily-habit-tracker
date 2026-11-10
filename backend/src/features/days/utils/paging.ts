const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/** A whole number from the text of a query, or `fallback` when it is not a number. */
function wholeNumber({
  text,
  fallback,
}: {
  text: string | undefined;
  fallback: number;
}): number {
  const value = Number(text ?? fallback);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

/** The page the owner asked for: 30 entries by default, 1 to 100, and a start of 0 or more. */
export function normalizePage({
  limit,
  offset,
}: {
  limit?: string | undefined;
  offset?: string | undefined;
}): { limit: number; offset: number } {
  return {
    limit: Math.min(
      Math.max(wholeNumber({ text: limit, fallback: DEFAULT_LIMIT }), 1),
      MAX_LIMIT,
    ),
    offset: Math.max(wholeNumber({ text: offset, fallback: 0 }), 0),
  };
}

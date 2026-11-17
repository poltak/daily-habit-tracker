const MINUS = "−";

/** "71%", or a dash when there is no share. */
export function formatPercent(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)}%`;
}

/** "+0.84" or "−0.58", with the sign of the rounded value. */
export function formatMoodDifference(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) {
    return "0.00";
  }
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded).toFixed(2)}`;
}

/** "+5 pts" or "−3 pts". */
export function formatPoints(points: number): string {
  if (points === 0) {
    return "0 pts";
  }
  return `${points > 0 ? "+" : MINUS}${Math.abs(points)} pts`;
}

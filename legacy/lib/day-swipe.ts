export const DAY_SWIPE_MIN_DISTANCE = 48;

// Swiping left moves forward a day and swiping right moves back, like turning a page.
// Mostly vertical drags return 0 so a page scroll that starts on the date row never changes the day.
export function dayOffsetFromSwipe({ deltaX, deltaY }: { deltaX: number; deltaY: number }): -1 | 0 | 1 {
  if (Math.abs(deltaX) < DAY_SWIPE_MIN_DISTANCE) return 0;
  if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return 0;
  return deltaX < 0 ? 1 : -1;
}

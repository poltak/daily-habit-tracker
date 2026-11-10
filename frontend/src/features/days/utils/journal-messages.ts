import type { Notice } from "../types.js";

export const WAIT_FOR_ENTRY =
  "Wait for the entry update to finish before changing the day.";
export const WAIT_FOR_SELECTION =
  "Wait for the mood or activity update to finish before changing the day.";
export const WAIT_BEFORE_SAVE =
  "Wait for the mood, activity, or goal update to finish before saving the entry.";
export const WAIT_BEFORE_DELETE =
  "Wait for the mood, activity, or goal update to finish before deleting the entry.";
export const PICK_MOOD = "Pick the mood that best sums up the day.";
export const OFFLINE_SAVE = "You’re offline. Reconnect to save this entry.";
export const OFFLINE_DELETE =
  "You’re offline. Reconnect before deleting an entry.";

export function infoNotice(text: string): Notice {
  return { kind: "info", text };
}

export function errorNotice(text: string): Notice {
  return { kind: "error", text };
}

/** The text of a notice with its mark. */
export function noticeText(notice: Notice): string {
  const mark =
    notice.kind === "success" ? "✓" : notice.kind === "info" ? "↻" : "!";
  return `${mark} ${notice.text}`;
}

import { jsonError, readJson } from "../../../../../lib/api";
import { isLogicalDate } from "../../../../../lib/daylio";
import { getServerStore } from "../../../../../lib/server-store";

export const dynamic = "force-dynamic";

type MoodSelectionInput = { moodId: string };

export async function PUT(request: Request, context: { params: Promise<{ logicalDate: string }> }) {
  try {
    const { logicalDate } = await context.params;
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    const input = await readJson<unknown>(request);
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof (input as MoodSelectionInput).moodId !== "string") throw new Error("Choose one of the five moods.");
    const store = await getServerStore();
    const selection = await store.setMoodSelection(logicalDate, (input as MoodSelectionInput).moodId);
    return Response.json({ selection });
  } catch (error) {
    return jsonError(error);
  }
}

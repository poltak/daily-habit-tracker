import { jsonError, readJson } from "../../../../../lib/api";
import { isLogicalDate } from "../../../../../lib/daylio";
import { getServerStore } from "../../../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ logicalDate: string }> }) {
  try {
    const { logicalDate } = await context.params;
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    const { moodId } = await readJson<{ moodId?: unknown }>(request);
    if (typeof moodId !== "string") throw new Error("Choose one of the five moods.");
    const store = await getServerStore();
    const selection = await store.setMoodSelection(logicalDate, moodId);
    return Response.json({ selection });
  } catch (error) {
    return jsonError(error);
  }
}

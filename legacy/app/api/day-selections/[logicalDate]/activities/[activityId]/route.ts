import { jsonError, readJson } from "../../../../../../lib/api";
import { isLogicalDate } from "../../../../../../lib/daylio";
import { getServerStore } from "../../../../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ logicalDate: string; activityId: string }> }) {
  try {
    const { logicalDate, activityId } = await context.params;
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    if (!activityId.trim()) throw new Error("One activity is no longer available.");
    const { selected } = await readJson<{ selected?: unknown }>(request);
    if (typeof selected !== "boolean") throw new Error("Activity selection must be a boolean.");
    const store = await getServerStore();
    return Response.json(await store.setActivitySelection(logicalDate, activityId, selected));
  } catch (error) {
    return jsonError(error);
  }
}

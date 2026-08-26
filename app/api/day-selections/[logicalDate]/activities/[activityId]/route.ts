import { jsonError, readJson } from "../../../../../../lib/api";
import { isLogicalDate } from "../../../../../../lib/daylio";
import { getServerStore } from "../../../../../../lib/server-store";

export const dynamic = "force-dynamic";

type ActivitySelectionInput = { selected: boolean };

export async function PUT(request: Request, context: { params: Promise<{ logicalDate: string; activityId: string }> }) {
  try {
    const { logicalDate, activityId } = await context.params;
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    if (!activityId.trim()) throw new Error("One activity is no longer available.");
    const input = await readJson<unknown>(request);
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof (input as ActivitySelectionInput).selected !== "boolean") throw new Error("Activity selection must be a boolean.");
    const store = await getServerStore();
    const selection = await store.setActivitySelection(logicalDate, activityId, (input as ActivitySelectionInput).selected);
    return Response.json({ selection });
  } catch (error) {
    return jsonError(error);
  }
}

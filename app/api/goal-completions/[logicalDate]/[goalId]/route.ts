import { jsonError, readJson } from "../../../../../lib/api";
import { isLogicalDate } from "../../../../../lib/daylio";
import { getServerStore } from "../../../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ logicalDate: string; goalId: string }> }) {
  try {
    const { logicalDate, goalId } = await context.params;
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    if (!goalId.trim()) throw new Error("One goal is no longer available.");
    const { completed } = await readJson<{ completed?: unknown }>(request);
    if (typeof completed !== "boolean") throw new Error("Goal completion must be a boolean.");
    const store = await getServerStore();
    return Response.json(await store.setGoalCompletion(logicalDate, goalId, completed));
  } catch (error) {
    return jsonError(error);
  }
}

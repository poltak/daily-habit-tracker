import { isLogicalDate, monthDateRange } from "../../../../../lib/daylio";
import { getServerStore } from "../../../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ goalId: string }> }) {
  try {
    const { goalId } = await context.params;
    if (!goalId.trim()) throw new Error("Goal not found.");
    const searchParams = new URL(request.url).searchParams;
    const asOf = searchParams.get("asOf");
    if (!asOf || !isLogicalDate(asOf)) throw new Error("Choose a valid current date.");
    const { startDate, endDate } = monthDateRange(searchParams.get("month") ?? "");
    const store = await getServerStore();
    return Response.json(await store.getGoalHistory({ goalId, startDate, endDate, asOf }));
  } catch (error) {
    const value = error as Error;
    return Response.json({ error: value.message || "Could not load goal history." }, { status: 400 });
  }
}

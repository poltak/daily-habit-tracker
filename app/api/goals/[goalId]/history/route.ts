import { isLogicalDate } from "../../../../../lib/daylio";
import { getServerStore } from "../../../../../lib/server-store";

export const dynamic = "force-dynamic";

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Choose a valid month.");
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
  if (!isLogicalDate(startDate) || !isLogicalDate(endDate)) throw new Error("Choose a valid month.");
  return { startDate, endDate };
}

export async function GET(request: Request, context: { params: Promise<{ goalId: string }> }) {
  try {
    const { goalId } = await context.params;
    if (!goalId.trim()) throw new Error("Goal not found.");
    const searchParams = new URL(request.url).searchParams;
    const month = searchParams.get("month") ?? "";
    const asOf = searchParams.get("asOf");
    if (!asOf || !isLogicalDate(asOf)) throw new Error("Choose a valid current date.");
    const { startDate, endDate } = monthRange(month);
    const store = await getServerStore();
    return Response.json(await store.getGoalHistory({ goalId, startDate, endDate, asOf }));
  } catch (error) {
    const value = error as Error;
    return Response.json({ error: value.message || "Could not load goal history." }, { status: 400 });
  }
}

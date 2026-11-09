import { jsonError } from "../../../lib/api";
import { monthDateRange } from "../../../lib/daylio";
import { getServerStore } from "../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { startDate, endDate } = monthDateRange(new URL(request.url).searchParams.get("month") ?? "");
    const store = await getServerStore();
    return Response.json({ days: await store.listEntryDays(startDate, endDate) });
  } catch (error) {
    return jsonError(error);
  }
}

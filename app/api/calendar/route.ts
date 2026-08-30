import { addDays, isLogicalDate } from "../../../lib/daylio";
import { getServerStore } from "../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "Choose a valid month." }, { status: 400 });
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const startDate = `${month}-01`;
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
  if (!isLogicalDate(startDate) || !isLogicalDate(endDate)) return Response.json({ error: "Choose a valid month." }, { status: 400 });
  const store = await getServerStore();
  const days = await store.listEntryDays(startDate, endDate);
  return Response.json({ month, startDate, endDate, dates: days.map((day) => day.logicalDate), days, previousMonth: addDays(startDate, -1).slice(0, 7), nextMonth: addDays(endDate, 1).slice(0, 7) });
}

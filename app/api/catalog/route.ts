import { jsonError, readJson } from "../../../lib/api";
import { getServerStore } from "../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const store = await getServerStore();
    const payload = await readJson<{ kind?: string; name?: string; groupId?: string; icon?: string; activityId?: string | null; materialIcon?: string; repeatType?: "daily" | "weekly"; scheduleType?: "daily" | "weekdays" | "times_per_week"; targetPerWeek?: number | null; weekdaysMask?: number | null }>(request);
    if (payload.kind === "group") return Response.json({ group: await store.createGroup(payload.name ?? "") }, { status: 201 });
    if (payload.kind === "activity") return Response.json({ activity: await store.createActivity(payload.name ?? "", payload.groupId ?? "", payload.icon) }, { status: 201 });
    if (payload.kind === "goal") return Response.json({ goal: await store.createGoal({ name: payload.name ?? "", activityId: payload.activityId, repeatType: payload.repeatType, scheduleType: payload.scheduleType, targetPerWeek: payload.targetPerWeek, weekdaysMask: payload.weekdaysMask, materialIcon: payload.materialIcon }) }, { status: 201 });
    throw new Error("Unsupported catalog item.");
  } catch (error) {
    return jsonError(error);
  }
}

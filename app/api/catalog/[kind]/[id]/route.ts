import { jsonError, readJson } from "../../../../../lib/api";
import { getServerStore } from "../../../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { kind, id } = await context.params;
    const payload = await readJson<Record<string, unknown>>(request);
    const store = await getServerStore();
    if (kind === "group") return Response.json({ group: await store.updateGroup(id, payload as never) });
    if (kind === "activity") return Response.json({ activity: await store.updateActivity(id, payload as never) });
    if (kind === "goal") return Response.json({ goal: await store.updateGoal(id, payload as never) });
    throw new Error("Unsupported catalog item.");
  } catch (error) {
    return jsonError(error);
  }
}

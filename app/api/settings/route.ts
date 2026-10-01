import { jsonError, readJson } from "../../../lib/api";
import { getServerStore } from "../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const payload = await readJson<Record<string, unknown>>(request);
    const store = await getServerStore();
    return Response.json({ settings: await store.updateSettings(payload) });
  } catch (error) {
    return jsonError(error);
  }
}

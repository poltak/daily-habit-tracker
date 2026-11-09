import { jsonError, readJson } from "../../../../lib/api";
import { getServerStore } from "../../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await readJson<unknown>(request);
    const store = await getServerStore();
    await store.reorderCatalog(payload);
    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}

import { jsonError, readJson } from "../../../lib/api";
import { type ImportPayload } from "../../../lib/daylio";
import { getServerStore } from "../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await readJson<ImportPayload>(request);
    if (payload.sourceSystem !== "daylio") throw new Error("Only Daylio normalized imports are supported.");
    const store = await getServerStore();
    return Response.json({ bootstrap: await store.importData(payload) });
  } catch (error) {
    return jsonError(error);
  }
}

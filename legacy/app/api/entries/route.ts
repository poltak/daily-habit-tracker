import { getServerStore } from "../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const store = await getServerStore();
  const params = new URL(request.url).searchParams;
  const requestedLimit = Number(params.get("limit") ?? "30");
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100) : 30;
  const requestedOffset = Number(params.get("offset") ?? "0");
  const offset = Number.isFinite(requestedOffset) ? Math.max(Math.trunc(requestedOffset), 0) : 0;
  const entries = await store.listEntries(limit + 1, offset);
  return Response.json({ entries: entries.slice(0, limit), hasMore: entries.length > limit, nextOffset: offset + Math.min(entries.length, limit) });
}

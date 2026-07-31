import { jsonError, readJson } from "../../../../lib/api";
import { type EntryInput, isLogicalDate } from "../../../../lib/daylio";
import { getServerStore } from "../../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ logicalDate: string }> }) {
  const { logicalDate } = await context.params;
  if (!isLogicalDate(logicalDate)) return Response.json({ error: "Invalid date." }, { status: 400 });
  const store = await getServerStore();
  const entry = await store.getEntry(logicalDate);
  return entry ? Response.json({ entry }) : Response.json({ entry: null }, { status: 404 });
}

export async function PUT(request: Request, context: { params: Promise<{ logicalDate: string }> }) {
  try {
    const { logicalDate } = await context.params;
    const input = await readJson<EntryInput>(request);
    const store = await getServerStore();
    return Response.json({ entry: await store.saveEntry(logicalDate, input) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ logicalDate: string }> }) {
  try {
    const { logicalDate } = await context.params;
    const expectedVersion = new URL(request.url).searchParams.get("expectedVersion");
    const store = await getServerStore();
    const entry = await store.deleteEntry(logicalDate, expectedVersion ? Number(expectedVersion) : undefined);
    return Response.json({ entry });
  } catch (error) {
    return jsonError(error);
  }
}

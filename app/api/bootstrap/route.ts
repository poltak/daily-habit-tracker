import { getServerStore } from "../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getServerStore();
  return Response.json(await store.bootstrap());
}

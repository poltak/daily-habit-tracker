import { getServerStore } from "../../../lib/server-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getServerStore();
  return new Response(JSON.stringify(await store.exportData(), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="daylio-clone-export.json"`,
    },
  });
}

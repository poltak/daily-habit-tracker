import type { InsightsData } from "@app/common/features/insights/types";
import { Hono } from "hono";
import type { BackendLogic } from "../../core/types.js";

interface InsightsHandlerProps {
  logic: Pick<BackendLogic, "catalog" | "days">;
}

/** The route of `/api/insights`: the catalog and the whole saved history. */
export function createInsightsHandlers({ logic }: InsightsHandlerProps) {
  return new Hono().get("/", async (context) => {
    const [catalog, days] = await Promise.all([
      logic.catalog.read(),
      logic.days.listEffectiveDays({}),
    ]);
    const data: InsightsData = {
      moods: catalog.moods,
      activities: catalog.activities,
      groups: catalog.groups,
      days,
    };
    // The history changes with each save, so no cache may keep it.
    return context.json(data, 200, { "cache-control": "private, no-store" });
  });
}

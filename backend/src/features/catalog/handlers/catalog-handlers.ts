import { Hono } from "hono";
import type { BackendLogic } from "../../core/types.js";

interface CatalogHandlerProps {
  logic: Pick<BackendLogic, "catalog">;
}

/** The routes of `/api/catalog`. */
export function createCatalogHandlers({ logic }: CatalogHandlerProps) {
  return new Hono().get("/", async (context) =>
    context.json(await logic.catalog.read(), 200),
  );
}

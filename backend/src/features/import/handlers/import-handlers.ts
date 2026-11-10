import { Hono, type Context } from "hono";
import { routeBodyLimit } from "../../core/handlers/body-limit.js";
import { AppError } from "../../core/errors/app-error.js";
import type { BackendLogic } from "../../core/types.js";

interface ImportHandlerProps {
  logic: Pick<BackendLogic, "catalog" | "days" | "imports">;
}

/** A backup of several years of days is a few megabytes of JSON. */
const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

/**
 * The client of this route is a script, such as `curl`, that reads one text
 * in `error`. So a refusal here keeps the body of the old app and not the
 * shared error body.
 */
function invalidRequest(context: Context, message: string) {
  return context.json({ error: message }, 400);
}

async function readBackupBody(
  request: Request,
): Promise<{ body: Record<string, unknown> } | { message: string }> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return { message: "Expected a JSON request." };
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { message: "The request body is not valid JSON." };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { message: "JSON body must be an object." };
  }
  return { body: body as Record<string, unknown> };
}

/** The route of `POST /api/import`: the catalog and the days of a Daylio backup. */
export function createImportHandlers({ logic }: ImportHandlerProps) {
  return new Hono().post(
    "/",
    routeBodyLimit({
      maxBytes: MAX_BACKUP_BYTES,
      message: "The backup is larger than 25 MB.",
    }),
    async (context) => {
      const read = await readBackupBody(context.req.raw);
      if ("message" in read) {
        return invalidRequest(context, read.message);
      }
      try {
        const backup = logic.imports.parse({ body: read.body });
        const catalogPlan = await logic.catalog.planImport({ backup });
        const daysPlan = await logic.days.planImport({
          backup,
          ids: catalogPlan.ids,
        });
        await logic.imports.apply({
          backup,
          statements: [
            ...catalogPlan.statements,
            ...daysPlan,
            ...catalogPlan.finish,
          ],
        });
      } catch (error) {
        if (error instanceof AppError && error.code === "INVALID_REQUEST") {
          return invalidRequest(context, error.message);
        }
        throw error;
      }
      return context.json({ bootstrap: await logic.catalog.read() }, 200);
    },
  );
}

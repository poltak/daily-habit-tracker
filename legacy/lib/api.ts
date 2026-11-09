export function jsonError(error: unknown) {
  const value = error as Error & { code?: string };
  const status = value.code === "VERSION_CONFLICT" ? 409 : 400;
  return Response.json({ error: value.message || "Something went wrong.", code: value.code }, { status });
}

export async function readJson<T>(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new Error("Expected a JSON request.");
  const body: unknown = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("JSON body must be an object.");
  return body as T;
}

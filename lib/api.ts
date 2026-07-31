export function jsonError(error: unknown) {
  const value = error as Error & { code?: string };
  const status = value.code === "VERSION_CONFLICT" ? 409 : 400;
  return Response.json({ error: value.message || "Something went wrong.", code: value.code }, { status });
}

export async function readJson<T>(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("Expected a JSON request.");
  return (await request.json()) as T;
}

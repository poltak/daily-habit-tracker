import type { DayState } from "@app/common/features/days/types";
import type { BackendApi } from "../../api/client/api-client.js";

/** The day as the server has it, with the taps of the owner on top. */
export async function fetchDayState({
  api,
  logicalDate,
  errorText,
  signal,
}: {
  api: Pick<BackendApi, "entries">;
  logicalDate: string;
  errorText: string;
  signal: AbortSignal;
}): Promise<DayState> {
  const response = await api.entries[":logicalDate"].$get(
    { param: { logicalDate } },
    { init: { signal } },
  );
  // A day without an entry answers 404 with the same body, and a route
  // that is missing answers 404 with an error.
  if (response.status !== 200 && response.status !== 404) {
    throw new Error(errorText);
  }
  const body = await response.json();
  if (!("daySelections" in body)) {
    throw new Error(errorText);
  }
  return body;
}

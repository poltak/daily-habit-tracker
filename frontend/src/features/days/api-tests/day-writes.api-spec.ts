import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

/** The UTC date `offset` days from now. The test never fixes a calendar date. */
function dayFromToday(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const SAVE = { moodId: "mood-good", activityIds: [], completedGoalIds: [] };

test.describe("writes to a day", () => {
  test("should refuse a save from a stale view with CONFLICT, and keep the day", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const day = dayFromToday(-3);
    const url = `${apiOrigin}/api/entries/${day}`;
    const created = await ownerRequest.put(url, {
      data: { ...SAVE, expectedVersion: 0 },
    });
    expect(created.status()).toBe(200);
    expect((await created.json()).entry).toMatchObject({ version: 1 });

    for (const expectedVersion of [0, 5]) {
      const stale = await ownerRequest.put(url, {
        data: { ...SAVE, moodId: "mood-rad", expectedVersion },
      });
      expect(stale.status()).toBe(409);
      expect((await stale.json()).error.code).toBe("CONFLICT");
    }

    const kept = await (await ownerRequest.get(url)).json();
    expect(kept.entry).toMatchObject({ moodId: "mood-good", version: 1 });
  });

  test("should refuse a delete from a stale view with CONFLICT, and keep the day", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const day = dayFromToday(-3);
    const url = `${apiOrigin}/api/entries/${day}`;
    await ownerRequest.put(url, { data: SAVE });

    const stale = await ownerRequest.delete(`${url}?expectedVersion=4`);

    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.code).toBe("CONFLICT");
    const kept = await ownerRequest.get(url);
    expect(kept.status()).toBe(200);
    expect((await kept.json()).entry).toMatchObject({ version: 1 });

    const deleted = await ownerRequest.delete(`${url}?expectedVersion=1`);
    expect(deleted.status()).toBe(200);
    expect(await deleted.json()).toEqual({ entry: null });
    expect((await ownerRequest.get(url)).status()).toBe(404);
  });

  test("should refuse an expected version that is not a whole number from 0", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const day = dayFromToday(-3);
    const url = `${apiOrigin}/api/entries/${day}`;
    await ownerRequest.put(url, { data: SAVE });

    for (const expectedVersion of [-1, 1.5, "1"]) {
      const response = await ownerRequest.put(url, {
        data: { ...SAVE, moodId: "mood-rad", expectedVersion },
      });
      expect(response.status(), `PUT ${expectedVersion}`).toBe(400);
    }
    for (const expectedVersion of ["abc", "-1", "1.5", ""]) {
      const response = await ownerRequest.delete(
        `${url}?expectedVersion=${expectedVersion}`,
      );
      expect(response.status(), `DELETE ${expectedVersion}`).toBe(400);
    }

    const kept = await (await ownerRequest.get(url)).json();
    expect(kept.entry).toMatchObject({ moodId: "mood-good", version: 1 });
  });

  test("should refuse a mood tap with a bad date, an unknown mood or a day that has not started", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const today = dayFromToday(0);
    const tap = (date: string, data: unknown) =>
      ownerRequest.put(`${apiOrigin}/api/day-selections/${date}/mood`, {
        data,
      });

    const ok = await tap(today, { moodId: "mood-good" });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toEqual({
      selection: { logicalDate: today, moodId: "mood-good" },
    });
    expect((await tap("yesterday", { moodId: "mood-good" })).status()).toBe(
      400,
    );
    expect((await tap("2026-02-30", { moodId: "mood-good" })).status()).toBe(
      400,
    );
    expect((await tap(today, { moodId: "mood-gone" })).status()).toBe(400);
    expect((await tap(today, {})).status()).toBe(400);
    // Another time zone can be a day ahead of UTC, so two days is not started.
    const future = await tap(dayFromToday(2), { moodId: "mood-good" });
    expect(future.status()).toBe(400);

    const kept = await (
      await ownerRequest.get(`${apiOrigin}/api/entries/${today}`)
    ).json();
    expect(kept.daySelections.moodId).toBe("mood-good");
  });

  test("should refuse an activity tap with a bad date, an unknown activity, a selected flag that is not a boolean or a day that has not started", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const today = dayFromToday(0);
    const tap = (date: string, activityId: string, data: unknown) =>
      ownerRequest.put(
        `${apiOrigin}/api/day-selections/${date}/activities/${activityId}`,
        { data },
      );

    const ok = await tap(today, "activity-gym", { selected: true });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({
      selection: {
        logicalDate: today,
        activityId: "activity-gym",
        selected: true,
      },
    });
    const bad = [
      await tap("yesterday", "activity-gym", { selected: true }),
      await tap(today, "activity-gone", { selected: true }),
      await tap(today, "activity-gym", { selected: "true" }),
      await tap(today, "activity-gym", {}),
      await tap(dayFromToday(2), "activity-gym", { selected: true }),
    ];
    expect(bad.map((response) => response.status())).toEqual([
      400, 400, 400, 400, 400,
    ]);
  });
});

test.describe("calendar route", () => {
  test("should list the saved days of a month with their moods", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const month = dayFromToday(0).slice(0, 7);
    const first = `${month}-01`;
    await ownerRequest.put(`${apiOrigin}/api/entries/${first}`, {
      data: { ...SAVE, moodId: "mood-rad" },
    });
    const empty = await (
      await ownerRequest.get(`${apiOrigin}/api/calendar?month=0001-01`)
    ).json();

    const response = await ownerRequest.get(
      `${apiOrigin}/api/calendar?month=${month}`,
    );

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      days: [{ logicalDate: first, moodId: "mood-rad" }],
    });
    expect(empty).toEqual({ days: [] });
  });

  test("should refuse a month that is missing or not a month", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    for (const query of [
      "",
      "?month=",
      "?month=2026-13",
      "?month=2026-1",
      "?month=January",
      "?month=2026-01-05",
    ]) {
      const response = await ownerRequest.get(
        `${apiOrigin}/api/calendar${query}`,
      );
      expect(response.status(), query).toBe(400);
    }
  });
});

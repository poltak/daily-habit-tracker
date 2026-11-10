import { defineConfig, devices } from "@playwright/test";
/**
 * The black-box tests run on the app in `backend/` and `frontend/`, as one
 * Worker that serves the API and the built frontend on one origin. See
 * `scripts/black-box-next.mjs`.
 */
// oxlint-disable-next-line node/no-process-env -- Playwright runs this file in Node, outside the app, and a run sets its port here. Each worktree can run the app on a port of its own.
const PORT = Number(process.env["NEXT_BLACK_BOX_PORT"] || 4354);
// Use localhost, not 127.0.0.1: a WebAuthn RP ID cannot be an IP address.
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  // The build checks in `core/tests/browser/`, the black box tests in each
  // feature's `black-box-tests/` directory, and the API black-box tests in
  // its `api-tests/` directory (docs/agents/project/rules.md).
  testDir: "src/features",
  testMatch: ["**/*.spec.ts", "**/*.api-spec.ts"],
  outputDir: ".browser-test/results",
  // Each Worker has one database for a whole run, and the fixture empties it
  // before each test, so only one test can run at a time.
  workers: 1,
  reporter: "list",
  // A local Worker takes a second for some requests, and a test that records
  // several days takes a while.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: ORIGIN,
    // The owner's day and the browser's day are the same in each test.
    timezoneId: "UTC",
    // A failed test leaves a trace in the output directory, to open with
    // `pnpm --filter frontend exec playwright show-trace <file>`.
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Builds the frontend, migrates a fresh local D1, and starts the Worker.
    command: `node scripts/black-box-next.mjs --port ${PORT}`,
    cwd: "..",
    url: `${ORIGIN}/api/auth/status`,
    reuseExistingServer: false,
    // The first run builds the backend and the frontend.
    timeout: 300_000,
  },
});

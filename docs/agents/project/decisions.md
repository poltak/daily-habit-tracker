# Daymark decisions

The project's own choices, with their reasons. Read this file when you read
[decisions](../decisions.md).

## The port onto the template

- The old app moved to `legacy/` and keeps running until the new app has each
  workflow. The black-box tests run against it first, so that the rebuild has
  a fixed target. The same tests then run against the new app with no change,
  because they know only what a user sees.
- Production uses the plain-DOM site in `legacy/vanilla/` (`worker.ts`,
  `wrangler.jsonc`, `build.mjs`). The React frontend in `legacy/app/` is an
  older version that production does not serve. The black-box tests cover the
  plain-DOM site only.
- `BLACK_BOX_TARGET` selects `legacy` or `next` in
  `frontend/playwright.config.ts`. The default is `legacy` until the new app
  passes each black-box test. The change that makes `next` the default deletes
  `legacy/` and the `legacy` paths of the config and the fixture. The `next`
  path is still the template's own: its Worker, sign-in and reset route come
  with a later phase.
- The old app changes only to give an element a role or an accessible name for
  the tests, and for the test-only reset route. The changes are:
  `aria-label` on the activity groups of the log and of Setup, `role="img"` on
  the day cells of the goal history, `role="group"` and a name on the weekly
  results and on the period summary of Insights.

## The black-box tests on the old app

- `legacy/scripts/black-box-serve.mjs` builds the plain site when one of its
  inputs changed, and starts two local Workers on that build with
  `wrangler dev --local`. Each has its own migrated D1 database.
  - `owner`: sign-in is off, because a request to `localhost` skips it, so
    each browser is the owner. A test with `authenticated: true` (the default)
    uses it.
  - `passkey`: `DAYMARK_LOCAL_PASSKEYS=true` turns sign-in on for `localhost`,
    and `DAYMARK_SETUP_CODE` is a known value (`black-box-setup-code`). A test
    with `authenticated: false` uses it.
    The script starts a Worker again when it stops, and gives each readiness
    request a limit of 5 seconds.
- The ports start at `LEGACY_BLACK_BOX_PORT` (default 4344) for the `owner`
  Worker, and the next port is the `passkey` Worker. The default is outside
  the 4274 to 4314 range that another project uses at the same time. The
  database folders are `legacy/.wrangler/black-box/<port>/`, so two runs on
  other ports do not share one.
- `wrangler dev` did not stop on the passkey sign-in request here. Calocount
  saw a "Network connection lost" stop in the dev proxy with the same request.
  If it comes back, run the Worker through Miniflare directly.
- Each Worker has one database for a whole run, so the fixture empties it
  before each test through a reset route. `POST /api/__black-box/reset`
  (`legacy/worker/black-box.ts`) deletes each row of each table, and adds the
  seed catalog that a new database has (five groups, twelve activities, two
  goals, five moods). The route exists only when `DAYMARK_BLACK_BOX` is `true`,
  which only the serve script sets. It answers before the sign-in gate.
- The tests use the real clock. The old Worker reads "today" from its own
  clock, and the site reads it from the browser, so a browser clock alone would
  give the two sides different days. Each browser is in UTC, so that the
  owner's day and the browser's day match. A run across midnight UTC can fail.
  `local-day.spec.ts` uses two other zones and computes the expected day in the
  test, so it does not depend on the time of the run.
- Passkeys come from a Chromium virtual authenticator that says yes to each
  request (the `passkeyDevice` option and `otherDevicePage`). The setup code is
  `setupCode` in the fixture.
- The browser asks before it leaves a page that has a save in progress. A test
  waits until the day is stored (the page objects wait for a button to take
  clicks again) before it opens another address.

## D1 and passkeys

- **The backend runs on Cloudflare Workers with D1.** `core/database/` has a
  Kysely dialect for a D1 binding (`d1-dialect.ts`), and `atomic` replaces
  `transaction()`: a Logic class plans statements with the `plan*` methods of
  Storage, and one D1 `batch()` runs them. The Worker entry is
  `core/server/worker.ts`, and `core/live/index.ts` builds the App from the
  Worker bindings.
- **The tests run on `node:sqlite`.** `core/tests/node-sqlite-d1.ts` has the
  shape of a D1 binding, with the limits of D1. It runs the files of
  `backend/migrations` in the order of their names.
- **`backend/migrations/0000` to `0010` are the SQL files of the old app
  (`legacy/drizzle/`), under their old names.** The production D1 database
  `daylio-clone` recorded those names as applied. Its tables keep their old
  columns (`ADOPTED_TABLES` in `core/database/table-kinds.ts`). A new table or
  change is a new file from `0011_<name>.sql` up, and a new table has the
  columns of `BaseTable`.
- **Sign-in is passkeys only, with the old app's rules.** The sign-in routes
  keep the paths and the JSON of the old app under `/api/auth`, and the cookie
  is `__Host-daymark_session` (`daymark_session` on `http://localhost`). The
  tables `passkeys`, `auth_sessions`, `auth_challenges` and `auth_attempts` are
  the old ones, which have no owner key (Daymark has one owner), so the
  passkeys and the sessions of the owner keep working. A session lasts 180 days
  of non-use. After a day of use it renews, and the answer sends the cookie
  again. The secret `DAYMARK_SETUP_CODE` saves a passkey without a session,
  also when passkeys exist, and 10 wrong codes of one network (50 of all
  networks) in 15 minutes stop it. The last passkey cannot go.
- **The new app has no local mode.** The old app skips sign-in for requests to
  `localhost`, unless `DAYMARK_LOCAL_PASSKEYS` is `true`. The new backend
  always needs a session, and a local run or a test signs in with a passkey.
- **The PostgreSQL migration system stays on disk, unused.** The migration
  check reads it, and the project takes over those template paths later with
  the template takeover of the D1 paths. `backend/tsconfig.json` leaves out the
  two files that no longer compile, and `knip.jsonc` lists the unused ones.

## What the black-box tests do not cover

- The import of a Daylio backup has no page. The site has no file field, and
  the import runs with `scripts/daylio_import.py` and `POST /api/import`.
- The MCP endpoint, the OAuth pages and routes, the content of the export file,
  `/api/health` and the other routes that no page calls have API black-box
  tests in `api-tests/` directories. See [rules](rules.md). The import of a
  Daylio backup has them too, and sends the normalized JSON that
  `scripts/daylio_import.py` makes.
- Drafts in device storage are not reachable through the page: a mood or an
  activity is stored on the server at once, so a draft stays only when a
  request is lost, and the page clears it then. The UI Logic tests of the new
  app cover the storage.
- The service worker is off on `localhost`, so the offline shell is not tested.

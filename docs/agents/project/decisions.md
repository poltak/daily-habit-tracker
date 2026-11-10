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

## One Worker on one origin

- **The new app is one Cloudflare Worker.** It serves the API and the built
  frontend (Workers static assets) on one origin, as the old app does. The page
  calls the API on its own origin, so a deployment sends no CORS headers and
  the cookie is first-party. `frontend/dist` is the assets directory. A path
  that is not a file gets `index.html`, and the Worker answers `/api/*`,
  `/health`, `/health/*` and the paths that later phases add (`/mcp`,
  `/oauth/*`, `/.well-known/*`, `/llms.txt`).
- **`wrangler.jsonc` is at the repository root.** The Deploy to Cloudflare
  button reads the root, and `backend/` imports the workspace package
  `common/`. The `cloudflare.bindings` description is in the root
  `package.json`, and `.dev.vars.example` lists the secret. The config has the
  same Worker name (`daylio-clone`) and the same D1 database as
  `legacy/vanilla/wrangler.jsonc`, so the new app can replace the old one on
  the same data. `migrations_dir` is `backend/migrations`, which holds the old
  files under their old names. The hourly cron calls
  `AuthSessionLogic.deleteExpired`, which removes expired sessions, challenges,
  attempts, OAuth codes and tokens, as the old `scheduled` handler does.
- **The frontend is built with an empty `VITE_API_BASE_URL`.** `pnpm run build`
  sets it, so the page uses its own origin whatever a local `.env` says.
- **The sign-in page is at `/login`, not `/sign-in`.** The old site used
  `/sign-in`. A later change for the OAuth consent flow must send the browser
  to `/login`, or the route must answer `/sign-in` too.
- **The reset route is `POST /api/__black-box/reset`.** It empties each app
  table between black-box tests, and adds the seed catalog of a new database
  (five moods, five groups, twelve activities, two goals), as the old route
  does. It exists only when `DAYMARK_BLACK_BOX` is `true`, which only
  `scripts/black-box-next.mjs` sets. `BlackBoxStorage` plans the deletes and
  the seed rows, `BlackBoxLogic` runs them in one batch and refuses without the
  setting, and the HTTP app mounts the handler only when `config.blackBox` is
  on. An integration test shows that it is absent without the setting. The
  seed rows are in `black-box/utils/seed-catalog.ts` until the catalog feature
  takes them over.
- **The `next` target signs in with passkeys.** There is one Worker, and a test
  with `authenticated: false` gets an empty instance. For `authenticated: true`
  the fixture uses a virtual authenticator, opens the sign-in page, and saves
  the first passkey with the setup code, as a real owner does, and gives the
  test that page. The old app's `localhost` mode with no sign-in does not exist
  in the new app.
- **The `next` Worker runs with `wrangler dev` 4.158.0.** The runtime of the
  4.92.0 version of the old app stopped at start-up with "Disallowed operation
  called within global scope", from the Logic classes that the Worker builds
  once for each isolate. Version 4.158.0 starts. The root `package.json` has it
  as a dev dependency. The compatibility date is the one of the old Worker.
- **The build checks of the template run on `next` only.** They use the passkey
  sign-in on the Worker (`core/tests/browser/`).

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

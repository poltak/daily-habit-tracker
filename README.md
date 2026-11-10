# daymark

Daymark is a small, server-backed Daylio-style journal for a single-user deployment. It stores
one mood, selected activities, and goal completions per logical calendar date.
The frontend is a mobile-first PWA built with React and Vite. One Cloudflare
Worker serves the API and the frontend, and the data is in Cloudflare D1.

## Local development

Prerequisites: Node.js (the version in `.nvmrc`), pnpm and Python 3 (for the
import tool).

```bash
pnpm install
cp .dev.vars.example .dev.vars   # then set DAYMARK_SETUP_CODE
pnpm run dev
```

`pnpm run dev` applies the checked-in D1 migrations, starts the Worker with
Wrangler on a local D1, and starts Vite with hot reload on
`http://localhost:5173`. The backend is not mocked or memory-only. Sign-in
needs a passkey, also on `localhost`: type the setup code on the first visit.
See [docs/sign-in.md](docs/sign-in.md) and
[the project setup](docs/agents/project/setup.md).

If `pnpm install` fails while it builds `sharp` from source, a system copy of
libvips is installed. Run `SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install`.

Useful checks:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:feature
pnpm run check
```

## Import a Daylio backup

Keep the source `.daylio` and CSV files outside this repository. First produce
the normalized, reconciled JSON report:

```bash
python3 scripts/daylio_import.py \
  --backup ../private/backup.daylio \
  --csv ../private/daylio_export.csv \
  --output /tmp/daylio-normalized.json
```

The script validates the Daylio v15 ZIP/Base64 format, handles the different
month conventions used by entries and goal history, preserves source IDs and
raw state values, skips photo bytes, and reports CSV mismatches. Send the
report to the app with the owner's session cookie (copy it from the browser;
its name is `__Host-daymark_session`, and `daymark_session` on `localhost`).
The app refuses a write from another origin, so the request names its own:

```bash
curl -X POST http://localhost:5173/api/import \
  -H 'content-type: application/json' \
  -H 'origin: http://localhost:5173' \
  -H 'cookie: daymark_session=<value>' \
  --data-binary @/tmp/daylio-normalized.json
```

The import uses deterministic IDs, bounded D1 batches, and an `import_runs`
record. Repeating it is safe. It records reconciliation results before and
after the import. It keeps unlinked Daylio goals with archived placeholder
links, because Daylio permits goals without an activity.

## Catalog and history

The Setup screen manages groups, activities, and goals: rename, regroup,
reorder, archive/restore, change Material Symbols Rounded icons, and cycle goal
schedules. Groups and their activities are in one panel. Groups, activities,
and goals can also be deleted, and a delete cannot be undone. A deleted goal
takes its completion history with it. A deleted activity is removed from each
recorded day, and a goal linked to it stays without an activity. A deleted
group takes its activities with it. The Calendar screen loads filled
days directly from D1, and selecting a day opens its entry. The Log screen
keeps unsaved drafts per logical date in device-local storage and reports
online, offline, and failed-save states. A successful save clears that local
draft.

## Insights

Open `/insights` from the journal navigation to analyze the full saved-entry
history. A shared date range filters activity/mood comparisons, exact calendar-day
offsets, activity combinations, weekday/month rhythms, and higher-mood week
comparisons. Charts include sample sizes, keep missing days out of mood averages,
and distinguish activities not recorded from days without an entry. Archived
activities remain available for historical comparisons.

`/api/insights` returns only the catalogs and effective date/mood/activity data
these views need, with private, no-store caching. It includes saved mood and
activity overrides, excludes deleted entries, and uses the same API access
protection as the rest of the journal. The patterns describe associations, not
causes.

## MCP server for agents

The Worker serves a Model Context Protocol endpoint at `/api/mcp`, so an AI
agent can read the journal's history and add entries. It is a stateless
Streamable HTTP server: each `POST` carries one JSON-RPC message and gets a JSON
reply. It uses the same D1 database as the rest of `/api`, but it signs in
with an OAuth access token, not with the session cookie of the app.

| Tool                   | What it does                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_overview`         | The moods and their scores, activities by group, goals and schedules, the week setting, and the first day, last day and count of recorded days. Agents call this first. |
| `get_days`             | Each recorded day in a date range: date, weekday, mood, score, activities and completed goals. At most 366 days per call.                                               |
| `summarize_mood`       | Recorded days, mean mood, share of good days and the mood distribution, for any span, grouped by month, year, week or weekday.                                          |
| `summarize_activities` | For each activity: days recorded, mean mood with and without it, and the difference. Uses the same calculation as the Insights screen.                                  |
| `get_goal_history`     | One goal's completed dates and weekly results in a date range.                                                                                                          |
| `save_day`             | Adds the entry for one day. It refuses a day that has not started, and it refuses to overwrite an existing day unless `replace_existing` is true.                       |

Reads return names, not IDs, to keep responses small. Two activities with the
same name are told apart by their group, for example `Walk (Health)`. `save_day`
accepts names or IDs, and it keeps goals and activities coupled the way the Log
screen does: listing an activity completes the goals linked to it.

The endpoint needs an OAuth access token. Add the server, then run `/mcp` in
Claude Code and choose to authenticate:

```bash
claude mcp add --transport http daymark https://<your-host>/api/mcp
```

The browser opens daymark. Sign in with your passkey if you have no session,
then allow Claude Code. Claude Code refreshes its token, and a refresh token
lasts 180 days after its last use. **Setup > Sign-in** lists the connected
apps and disconnects them. The details are in [docs/sign-in.md](docs/sign-in.md).

## Cloudflare deployment

`wrangler.jsonc` declares the Worker, the D1 binding and the migrations. The
GitHub workflow `.github/workflows/deploy-production.yml` deploys production
on pushes to `main` or `master`. It runs `pnpm run check`, and then
`pnpm run deploy`, which builds, applies all checked-in D1 migrations to the
remote `daylio-clone` database and deploys the Worker. The deploy does not
start if a check fails. If the Worker deploy fails after migrations succeed,
the database remains migrated and the next workflow run applies only pending
migrations before retrying the deploy.

Before the first production push:

1. In Cloudflare, create a scoped API token for this account only. Grant
   `Workers Scripts: Edit` and `D1: Edit` permissions. Do not grant access to
   other accounts.
2. In the GitHub repository, create the `production` environment. Add the
   `CLOUDFLARE_API_TOKEN` token and the `CLOUDFLARE_ACCOUNT_ID` Cloudflare
   account ID as environment secrets with these exact names.
3. Optionally protect the `production` environment with required reviewers or
   branch rules. The workflow uses this environment for every production deploy.

Keep the token in GitHub Secrets. Do not commit it or print it in workflow logs.
To retry after a failure, fix the reported issue and push a new commit to
`main` or `master`.

The owner signs in with a passkey. Before the first sign-in, add a setup code
with at least 12 characters as a secret of the Worker:

```bash
pnpm exec wrangler secret put DAYMARK_SETUP_CODE
```

Then open the app, type the setup code, and save a passkey. The setup code
also adds a passkey after you lose all your devices. Sign-in, the OAuth server
for MCP clients, and the move from Cloudflare Access are in
[docs/sign-in.md](docs/sign-in.md).

## The template

This project started from a template, and can take the template's later
changes. [`template-version.json`](template-version.json) names the template
and the last template commit that the project has. The `sync-template`
workflow takes the new commits, and
[setup](docs/agents/setup.md#changes-from-the-template) has its commands.

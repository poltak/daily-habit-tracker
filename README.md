# daymark

Daymark is a small, server-backed Daylio-style journal for a single-user deployment. It stores
one mood, selected activities, and goal completions per logical calendar date.
The frontend is a mobile-first React PWA; the production storage target is
Cloudflare D1.

## Local development

Prerequisites: Node.js `>=22.13.0` and Python 3.

```bash
pnpm install
pnpm run dev
```

`pnpm run dev` applies the checked-in D1 migrations and starts the vinext/Vite
development server with hot module replacement on `http://localhost:3000`.
The backend is not mocked or memory-only. The Cloudflare Vite plugin provides
the configured local D1 binding. When no Cloudflare Access variables are set,
the Worker allows local API requests. Use `pnpm run dev:wrangler` only when you
need to build first and run the compiled Worker without hot reload.

Useful checks:

```bash
pnpm test
pnpm run test:import
pnpm run lint
pnpm run typecheck
pnpm run build
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
report to a running local app:

```bash
curl -X POST http://localhost:3000/api/import \
  -H 'content-type: application/json' \
  --data-binary @/tmp/daylio-normalized.json
```

The import uses deterministic IDs, bounded D1 batches, and an `import_runs`
record. Repeating it is safe. It records reconciliation results before and
after the import. It keeps unlinked Daylio goals with archived placeholder
links, because Daylio permits goals without an activity.

## Catalog and history

The Setup screen manages groups, activities, and goals: rename, regroup,
reorder, archive/restore, change Material Symbols Rounded icons, and cycle goal
schedules. The Calendar screen loads filled days directly from D1, and
selecting a day opens its entry. The Log screen
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
reply. It uses the same D1 database and the same access check as the rest of
`/api`.

| Tool | What it does |
| --- | --- |
| `get_overview` | The moods and their scores, activities by group, goals and schedules, the week setting, and the first day, last day and count of recorded days. Agents call this first. |
| `get_days` | Each recorded day in a date range: date, weekday, mood, score, activities and completed goals. At most 366 days per call. |
| `summarize_mood` | Recorded days, mean mood, share of good days and the mood distribution, for any span, grouped by month, year, week or weekday. |
| `summarize_activities` | For each activity: days recorded, mean mood with and without it, and the difference. Uses the same calculation as the Insights screen. |
| `get_goal_history` | One goal's completed dates and weekly results in a date range. |
| `save_day` | Adds the entry for one day. It refuses a day that has not started, and it refuses to overwrite an existing day unless `replace_existing` is true. |

Reads return names, not IDs, to keep responses small. Two activities with the
same name are told apart by their group, for example `Walk (Health)`. `save_day`
accepts names or IDs, and it keeps goals and activities coupled the way the Log
screen does: listing an activity completes the goals linked to it.

Connect Claude Code to a local dev server, which needs no authentication:

```bash
claude mcp add --transport http daymark http://localhost:3000/api/mcp
```

In production the endpoint sits behind Cloudflare Access like every `/api`
route. Fetch an Access token for your own identity with `cloudflared` and send
it in the `cf-access-token` header:

```bash
claude mcp add --transport http daymark https://<your-host>/api/mcp \
  --header "cf-access-token: $(cloudflared access token -app=https://<your-host>)"
```

The token expires with your Access session. Run the command again to renew it.

## Cloudflare deployment

`wrangler.jsonc` declares the D1 binding and migrations. The GitHub workflow
`.github/workflows/deploy-production.yml` deploys production on pushes to
`main` or `master`. It runs lint and the full test command, applies all checked-in
D1 migrations to the remote `daylio-clone` database, and then runs `pnpm run deploy`.
The Worker deploy does not start if lint, tests, or migrations fail. If the
Worker deploy fails after migrations succeed, the database remains migrated and
the next workflow run applies only pending migrations before retrying the deploy.

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

For the single-user lock, configure Cloudflare Access JWT verification on the
Worker with:

- `ACCESS_TEAM_DOMAIN`: the `https://<team>.cloudflareaccess.com` domain
- `ACCESS_AUD`: the Access application audience tag
- `ALLOWED_EMAIL`: the only permitted email address

If all three variables are absent, the Worker accepts API requests only from
local development hosts.

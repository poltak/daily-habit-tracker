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

`pnpm run dev` builds the vinext output, applies the checked-in D1 migrations,
and starts the compiled Worker with `wrangler dev --local` on
`http://localhost:3000`. It is not a memory-only or Vite-mocked backend. When
no Cloudflare Access variables are set, local API requests are allowed and the
configured local D1 binding is used. Use `pnpm run dev:vite` only when you want
the separate HMR-oriented Vite preview.

Useful checks:

```bash
pnpm test
pnpm run test:import
pnpm run lint
pnpm run typecheck
pnpm run build
```

## Import a Daylio backup

The source `.daylio` and CSV files stay outside this repository. First produce
the normalized, reconciled JSON report:

```bash
python3 scripts/daylio_import.py \
  --backup ../private/backup.daylio \
  --csv ../private/daylio_export.csv \
  --output /tmp/daylio-normalized.json
```

The script validates the Daylio v15 ZIP/Base64 format, handles the different
month conventions used by entries and goal history, preserves source IDs and
raw state values, skips photo bytes, and reports CSV mismatches. Apply it to a
running local app with:

```bash
curl -X POST http://localhost:3000/api/import \
  -H 'content-type: application/json' \
  --data-binary @/tmp/daylio-normalized.json
```

The import uses deterministic IDs, bounded D1 batches, an `import_runs` record,
and is safe to repeat. Reconciliation results are recorded before and after
import. Unlinked Daylio goals are retained with archived placeholder links
because Daylio permits goals without an activity.

## Catalog and history

The Setup screen manages groups, activities, and goals: rename, regroup,
reorder, archive/restore, change Material Symbols Rounded icons, and cycle goal
schedules. The Calendar screen loads filled days directly from D1; selecting a
day opens its entry. The Entries screen paginates older records instead of
loading the complete history into the first response. The Log screen preserves
unsaved drafts per logical date in device-local storage and clearly reports
online, offline, and failed-save states; a successful save clears that local
draft.

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

- `ACCESS_TEAM_DOMAIN` — the `https://<team>.cloudflareaccess.com` domain
- `ACCESS_AUD` — the Access application audience tag
- `ALLOWED_EMAIL` — the sole permitted email address

If these variables are absent, API auth remains open for local development.

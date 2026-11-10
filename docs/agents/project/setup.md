# Daymark setup

How to run what the project adds. Read this file when you read
[setup and commands](../setup.md).

## The app

The app is one Worker. It serves the API and the built frontend on one origin.
`wrangler.jsonc` at the repository root holds its config.

```sh
cp .dev.vars.example .dev.vars    # then set DAYMARK_SETUP_CODE
pnpm run dev                      # the Worker on a local D1, and Vite with hot reload
pnpm run build                    # the backend, and the frontend for one origin
pnpm run test:live-start          # starts the Worker on an empty local D1 and probes it
```

`pnpm run dev` builds the backend, migrates a local D1, starts `wrangler dev`
on port 8787 (`DEV_WORKER_PORT` in `.env` changes it) and starts Vite. Open
<http://localhost:5173>. Vite proxies the Worker paths, and a change to the
frontend reloads at once. A change to the backend needs a new
`pnpm run dev`. The D1 state is in `.wrangler/state/`, and Git ignores it.
Sign-in needs a passkey, also on `localhost`: type the setup code on the first
visit (see [sign-in](../../sign-in.md)).

`pnpm run deploy` builds, applies the migrations to the remote D1 and deploys.
An agent never runs it. A push to `main` runs it in
`.github/workflows/deploy-production.yml`, after `pnpm run check`.

## The import tool

`scripts/daylio_import.py` turns a Daylio backup into the JSON that
`POST /api/import` takes. It needs Python 3 and no package. The README has the
steps. `pnpm run test:import` runs its tests (`scripts/test_daylio_import.py`),
and `pnpm run check` includes them.

## Black-box tests

```sh
pnpm run test:browser:install
cd frontend
pnpm exec playwright test                                       # the whole suite
pnpm exec playwright test src/features/days/black-box-tests     # one feature
NEXT_BLACK_BOX_PORT=4364 pnpm exec playwright test              # another port
```

`scripts/black-box-next.mjs` starts the Worker on `NEXT_BLACK_BOX_PORT`
(default 4354). It builds the backend and the frontend each time, then runs
`wrangler dev --local` on a fresh local D1 in `.wrangler/black-box/`, which Git
ignores. It never runs a command against Cloudflare. A worktree that runs the
tests at the same time as another one needs another port.

Run one or a few spec files at a time while you work, and the whole suite once
at the end: the machine is shared. The setup code is `black-box-setup-code`.
A test with `authenticated: true` (the default) starts as the signed-in owner:
the fixture saves the owner's passkey on the sign-in page. A test with
`authenticated: false` starts on an instance with no passkey.

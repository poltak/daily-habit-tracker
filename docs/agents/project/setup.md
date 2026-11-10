# Daymark setup

How to run what the project adds. Read this file when you read
[setup and commands](../setup.md).

## The old app

The old app is the `legacy` workspace. The root checks skip it.

```sh
pnpm --filter legacy run dev    # builds the plain site, migrates a local D1, starts the Worker on :3000
pnpm --filter legacy run test   # builds both frontends, type-checks, runs the old tests
```

On `localhost` the old app skips sign-in. To try passkeys, see
[sign-in](../../sign-in.md).

## The new app

The new app is one Worker. It serves the API and the built frontend on one
origin, as the old app does. `wrangler.jsonc` at the repository root holds its
config.

```sh
cp .dev.vars.example .dev.vars    # then set DAYMARK_SETUP_CODE
pnpm run dev                      # builds, migrates a local D1, starts the Worker
pnpm run build                    # the backend, and the frontend for one origin
pnpm run test:live-start          # starts the Worker on an empty local D1 and probes it
```

`pnpm run dev` serves on <http://localhost:8787>. It builds once and does not
reload on a change, so run it again after an edit. Its D1 state is in
`.wrangler/state/`, and Git ignores it. `pnpm run deploy` builds, applies the
migrations to the remote D1 and deploys. An agent never runs it.

## Black-box tests

```sh
pnpm run test:browser:install
cd frontend
pnpm exec playwright test                                       # against the old app
BLACK_BOX_TARGET=next pnpm exec playwright test                 # against the new app
LEGACY_BLACK_BOX_PORT=4374 pnpm exec playwright test            # other ports
pnpm exec playwright test src/features/days/black-box-tests     # one feature
NEXT_BLACK_BOX_PORT=4364 BLACK_BOX_TARGET=next pnpm exec playwright test   # other next port
```

| Target   | Port                                            | Started by                           |
| -------- | ----------------------------------------------- | ------------------------------------ |
| `legacy` | `LEGACY_BLACK_BOX_PORT` (4344) and the next one | `legacy/scripts/black-box-serve.mjs` |
| `next`   | `NEXT_BLACK_BOX_PORT` (4354)                    | `scripts/black-box-next.mjs`         |

The first `legacy` run builds the plain site, and a later run builds it again
only when one of its inputs changed. The two Workers are local only: the script
runs `wrangler dev --local` and `wrangler d1 migrations apply --local`, and
the data is in `legacy/.wrangler/black-box/`, which Git ignores. It never runs a
command against Cloudflare. A worktree that runs the tests at the same time as
another one needs other ports.

Run one or a few spec files at a time while you work, and the whole suite once
at the end: the machine is shared. A test with `authenticated: false` uses the
second Worker, where the setup code is `black-box-setup-code`.

A `next` run builds the backend and the frontend each time, then starts
`wrangler dev` on a fresh local D1 in `.wrangler/black-box/`. The `next` Worker
has the same setup code and the reset route. A test with `authenticated: true`
starts as the signed-in owner: the fixture saves the owner's passkey on the
sign-in page. Most tests fail on `next` until the features exist, and the
failures are the to-do list of the rebuild.

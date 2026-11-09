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

## Black-box tests

```sh
pnpm run test:browser:install
cd frontend
pnpm exec playwright test                                       # against the old app
BLACK_BOX_TARGET=next pnpm exec playwright test                 # against the new app
LEGACY_BLACK_BOX_PORT=4374 pnpm exec playwright test            # other ports
pnpm exec playwright test src/features/days/black-box-tests     # one feature
```

| Target   | Port                                            | Started by                              |
| -------- | ----------------------------------------------- | --------------------------------------- |
| `legacy` | `LEGACY_BLACK_BOX_PORT` (4344) and the next one | `legacy/scripts/black-box-serve.mjs`    |
| `next`   | the template's `43110` and `43120`              | the web server in the Playwright config |

The first `legacy` run builds the plain site, and a later run builds it again
only when one of its inputs changed. The two Workers are local only: the script
runs `wrangler dev --local` and `wrangler d1 migrations apply --local`, and
the data is in `legacy/.wrangler/black-box/`, which Git ignores. It never runs a
command against Cloudflare. A worktree that runs the tests at the same time as
another one needs other ports.

Run one or a few spec files at a time while you work, and the whole suite once
at the end: the machine is shared. A test with `authenticated: false` uses the
second Worker, where the setup code is `black-box-setup-code`.

# Template parts that Daymark leaves out

Daymark takes the template's changes with `pnpm run template:sync`. It leaves
out the parts below. `skipped` in `template-version.json` names each template
commit that the sync left out, with its reason. Leave out later commits to
these parts in the same way.

## The shared UI kit

The template has a UI kit: shared components on Base UI and shadcn, Tailwind
CSS 4, Lucide icons, a theme, a component registry, a component library page,
the `ui-design` skill, and lint rules and checks for them.

- **Daymark keeps the stylesheet of its production app.** The pages must look
  the same as before the port, so the old CSS is in
  `frontend/src/features/core/ui/styles/` without change (see
  [decisions](decisions.md)). The kit restyles each page.
- **The kit adds dependencies** (Tailwind CSS, Base UI, Lucide), and a new
  dependency needs the owner's approval.
- So the kit files are not in the project, and `templateOwned` of
  `scripts/template-paths.json` does not list them. The two tests of the sync
  scripts about project shadcn files are removed, because the project has no
  shadcn list. `lint/ui-rules.ts` stays, because the lint plugin imports it;
  `.oxlintrc.json` does not turn on its rules.

## The screenshot tool

`pnpm run ui:screens` and the `ui-review` skill take screenshots of each page on
the template's browser-test backend: a Node backend and the built frontend on
two origins (`core/tests/browser/origins.ts`). Daymark runs its pages on one
Worker (`scripts/black-box-next.mjs`), and has no such backend. The tool, its
`*.screens.ts` files, its workflow, its document and the skill are removed.
To use it, give it a fixture on the Worker first.

## Scripts that the project owns

`scripts/check-live-start.mjs` starts the Worker, not the template's Node
server, and Daymark has no `scripts/dev-database.*`, because it has no
PostgreSQL. The template's TypeScript versions of these files are left out.
Only a person can record a path as the project's own with
`pnpm run template:sync own`.

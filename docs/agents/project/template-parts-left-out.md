# Template parts that Daymark leaves out

Daymark takes the template's changes with `pnpm run template:sync`. It leaves
out the parts below. `skipped` in `template-version.json` names each template
commit that the sync left out, with its reason. Leave out later commits to
these parts in the same way.

## The shared UI kit

The template has a UI kit: shared components on Base UI and shadcn, Tailwind
CSS 4, Lucide icons, a theme, a component registry, the `ui-design` skill, and
lint rules and checks for them.

- **The kit is in the project, and no page uses it.** The gate files of the
  template (`scripts/template-paths.json` and its hook test) list the kit's
  files in `templateOwned`, and a project cannot take over a gate file. So the
  kit's files, its dependencies (Tailwind CSS, Base UI, Lucide, shadcn CLI) and
  its checks (`check:shadcn`, `check:registry`) are here, at the template's
  versions.
- **Daymark keeps the stylesheet of its production app.** The pages must look
  the same as before the port, so the old CSS is in
  `frontend/src/features/core/ui/styles/` without change (see
  [decisions](decisions.md)). No page, no `main.tsx` import and no CSS of the
  app uses the kit, and `vite.config.ts` has no Tailwind plugin. The built
  stylesheet is the same as before.
- `knip.jsonc` lists the kit's files and dependencies as entries or ignores,
  because nothing imports them. `.prettierignore` skips the generated
  `shadcn/` folder, as the template does. `.oxlintrc.json` turns on the kit's
  lint rules, as the template does, and they find nothing in the app's code.
- To use the kit on a page, import `theme.css` and the others from `main.tsx`
  and decide how the old stylesheet and the kit live together.

## The screenshot tool

`pnpm run ui:screens` and the `ui-review` skill take screenshots of each page on
the template's browser-test backend: a Node backend and the built frontend on
two origins (`core/tests/browser/origins.ts`). Daymark runs its pages on one
Worker (`scripts/black-box-next.mjs`), and has no such backend. The tool, its
`*.screens.ts` files and its workflow are removed. The `ui-review` skill is in
the project because the gate files list it, but it refers to this tool, so it
does not work.

Until `ui:screens` runs on the Worker, a UI review has no screens. The
reviewer reports this as a coverage finding, and the author does not claim a
visual pass. The author takes screens of each changed route and its sibling
pages at 1280 px and 390 px, in the light and the dark theme, from the
black-box Worker (`NEXT_BLACK_BOX_PORT`, with made-up rows only), and gives the
reviewer the paths of the PNG files. A beads issue tracks the port of
`ui:screens` to the Worker. The links to `ui-screens.md` in the template's
documents point to the file that this removal took out.

## Scripts that the project owns

`scripts/check-live-start.mjs` starts the Worker, not the template's Node
server, and Daymark has no `scripts/dev-database.*`, because it has no
PostgreSQL. The template's TypeScript versions of these files are left out.
Only a person can record a path as the project's own with
`pnpm run template:sync own`.

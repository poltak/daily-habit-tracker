# Daylio clone MVP implementation plan

Status: implementation-ready plan  
Last updated: 2026-07-29  
Companion research: DAYLIO_DISCOVERY.md

## 1. Objective

Build a private, installable, mobile-first web app that can replace a Daylio workflow:

1. Pick the logical day being described, especially yesterday when logging after midnight.
2. Select exactly one of five mood levels.
3. Select any number of grouped, user-defined activities.
4. Record goal completions for that logical day.
5. Save the record to a server-authoritative database.
6. Review and correct recent records.
7. Import the supplied Daylio history with independently verified fidelity.
8. Export all app-owned data in an open format.

The MVP is for a single-user deployment. It should be deliberately small, inexpensive to operate, and usable as a daily tracker before statistics or native apps are attempted.

## 2. Fixed product decisions

These decisions are already made and should not be reopened during implementation unless the user explicitly asks:

- Frontend: React, TypeScript, and Vite.
- Delivery: installable responsive PWA, optimized first for Android-sized screens.
- Backend: Cloudflare Worker.
- Database: Cloudflare D1.
- Authority model: the server is authoritative. There is no offline write queue or multi-master synchronization in the MVP.
- Authentication: Cloudflare Access protecting a custom hostname, restricted to the approved identity.
- Primary Daylio import source: the supplied manual .daylio backup.
- Import audit source: the supplied CSV export.
- Data model: logical entry date is distinct from save time and entry clock time.
- Activity IDs are authoritative. Names are not unique.
- Statistics are post-MVP.
- Photo, audio, scale, and general note-authoring interfaces are out of scope.
- Historical photos may be skipped. Legacy notes should be preserved losslessly even though note authoring is absent.
- No React Native or React Native Web in the MVP.
- No multi-user registration, password management, billing, social features, or administrator interface.

## 3. Definition of the MVP

### Included

- Cloudflare Access sign-in.
- Five fixed mood levels: rad, good, meh, bad, and awful.
- Import and display of the existing mood choices.
- Import of activity groups, activities, their order, state, and original Daylio icon IDs.
- Material Symbols Rounded icons for the new UI, with a generic fallback where no mapping exists.
- Create, rename, regroup, reorder, and archive activity groups and activities.
- A fast add/edit daily-entry screen.
- Today, yesterday, and explicit custom-date selection.
- One entry per logical date.
- Grouped multi-select activities with activity search.
- Active goals and daily completion toggles.
- Import of existing goal definitions and completion history.
- Creation, editing, ordering, and archiving of goals.
- Recent-entry timeline with editing and soft deletion.
- Installable PWA metadata and cached application shell.
- Clear offline and save-error states. Unsaved drafts survive an accidental refresh.
- Versioned JSON export containing all app-owned domain data.
- A dry-run-first Daylio import tool and a human-readable import report.
- Automated tests for the domain rules, API, database, and importer.

### Explicitly excluded

- Statistics, charts, correlations, streak dashboards, and calendar heatmaps.
- Multiple entries for one logical date.
- Fully offline use, background synchronization, or conflict resolution between devices.
- Native Android or iOS builds.
- Importing or displaying the 37 historical JPEG assets.
- Adding new entry notes, photos, audio, or scale values.
- Daylio achievements, challenges, writing templates, themes, or milestone UI.
- Email/password authentication implemented by this project.
- Sharing, public profiles, PDF reports, or third-party health integrations.

## 4. Success criteria

The MVP is ready for real use only when all of these statements are true:

- The production hostname is inaccessible to anyone except the user's approved Cloudflare Access identity.
- The user can install the site on Android and open it in standalone display mode.
- A new entry can be created or an existing entry corrected in under a minute on a phone.
- Saving an entry atomically persists the mood, activities, and goal completions for its logical date.
- A failed or offline save is never presented as successful.
- All source Daylio entries are imported.
- The imported entries match the independent audit data on date, time, mood, and activity selections with zero mismatches.
- Importing the same backup twice does not create duplicates or change verified totals.
- Current activity groups, activities, goals, and historical goal completions survive import.
- The user can produce a complete versioned JSON export from production.
- The test, typecheck, and production-build commands all pass from a clean checkout.

## 5. Architecture

Use one Cloudflare Workers project containing both the React SPA and the API Worker:

- Cloudflare serves Vite's static output as Worker static assets.
- SPA navigation uses single-page-application fallback handling.
- Requests under /api are routed through the Worker first.
- The React app calls only same-origin /api endpoints.
- The Worker validates the Cloudflare Access assertion for API requests and talks to D1 through an environment binding.
- D1 is the sole production source of truth.
- The service worker caches only the application shell and immutable static assets. It does not cache authenticated API responses as durable data.
- A small localStorage draft protects unsaved form input. It is not treated as a committed entry.

Do not split the frontend and API across different domains. Same-origin hosting avoids CORS complexity, makes Access behavior simpler, and keeps the app deployable as one unit.

Current Cloudflare documentation explicitly supports a React SPA plus API Worker through the Cloudflare Vite plugin and a single static-assets deployment. Configure SPA fallback and route /api through the Worker.

## 6. Recommended repository layout

The implementing model may adapt exact filenames to the scaffold, but responsibilities should remain separated:

- src/client
  - app shell, routes, screens, components, hooks, styles, and PWA registration
- src/worker
  - Worker entrypoint, authentication, routing, request validation, and response helpers
- src/domain
  - shared domain types, schedule rules, date logic, and pure validation
- src/db
  - typed D1 repositories and row-to-domain mapping
- migrations
  - ordered D1 SQL migrations
- scripts/daylio-import
  - backup parser, normalization, audit comparison, dry run, and apply commands
- tests/fixtures
  - synthetic and sanitized fixtures only
- public
  - manifest assets, PWA icons, self-hosted icon font, and license notices
- docs
  - deployment runbook, import runbook, and recovery/export instructions

Never commit the real .daylio file, CSV, extracted JSON, photos, generated SQL containing user data, D1 dumps, Access credentials, or production exports. Add the relevant names and scratch directories to .gitignore in the first implementation commit.

## 7. Dependency policy

Start from Cloudflare's current React + Vite Worker scaffold and use pnpm.

Prefer the smallest dependency set:

- React and React DOM for the interface.
- Cloudflare Vite plugin and Wrangler for local development and deployment.
- jose for Cloudflare Access JWT verification, following Cloudflare's Worker example.
- Vitest and Cloudflare's current Workers test integration for unit and Worker tests.
- React Testing Library for interaction tests.

Avoid an ORM initially. D1 has SQLite semantics and the schema is small enough for explicit SQL migrations and prepared repository queries.

Avoid an API framework unless native Worker routing becomes materially unclear. The API surface is small enough for a lightweight in-project router.

Do not add a PWA package merely for a manifest. Begin with an explicit manifest and a minimal service worker. If update handling becomes error-prone, propose a PWA plugin before adding it.

Per repository policy, the implementing model must ask for confirmation before installing any new production dependency. Dev-only test/build dependencies do not require that confirmation.

## 8. Database schema

Use text IDs throughout. New records receive UUIDs. Imported records receive deterministic IDs derived from their source entity and Daylio ID, which makes retries idempotent.

### app_metadata

- key: text primary key
- value: text
- updated_at: timestamp

Use for schema-independent application metadata such as the export format version.

### mood_levels

- id: text primary key
- score: integer, unique, constrained to 1 through 5
- name: text
- material_icon: text
- color: text
- sort_order: integer
- source_system: nullable text
- source_id: nullable text

Seed exactly five records. The analytic score must remain stable even if a display label changes later.

### activity_groups

- id: text primary key
- name: text
- sort_order: integer
- archived_at: nullable timestamp
- source_system: nullable text
- source_id: nullable text
- created_at and updated_at: timestamps

### activities

- id: text primary key
- group_id: text foreign key to activity_groups
- name: text
- material_icon: text
- source_icon_id: nullable text
- sort_order: integer
- archived_at: nullable timestamp
- source_system: nullable text
- source_id: nullable text
- created_at and updated_at: timestamps

Do not put a unique constraint on name. The supplied backup contains six normalized duplicate-name pairs.

### entries

- id: text primary key
- logical_date: ISO date text, unique and required
- local_time: nullable HH:MM text
- timezone: nullable IANA timezone text
- timezone_offset_minutes: nullable integer
- mood_id: text foreign key to mood_levels
- legacy_note_title: nullable text
- legacy_note: nullable text
- version: positive integer, default 1
- source_system: nullable text
- source_id: nullable text
- source_created_at: nullable timestamp
- created_at and updated_at: timestamps
- deleted_at: nullable timestamp

The unique logical_date constraint intentionally enforces the one-entry-per-day MVP.

### entry_activities

- entry_id: text foreign key to entries
- activity_id: text foreign key to activities
- primary key on entry_id and activity_id

### goals

- id: text primary key
- activity_id: text foreign key to activities
- name: text
- schedule_type: daily, weekdays, or times_per_week
- target_per_week: nullable integer
- weekdays_mask: nullable integer
- start_date: nullable ISO date
- end_date: nullable ISO date
- reminder_enabled: integer boolean
- reminder_local_time: nullable HH:MM
- sort_order: integer
- archived_at: nullable timestamp
- source_system: nullable text
- source_id: nullable text
- source_repeat_type: nullable integer
- source_repeat_value: nullable integer
- source_state: nullable integer
- created_at and updated_at: timestamps

Preserve Daylio's raw repeat and state values even after mapping them into app fields.

### goal_completions

- id: text primary key
- goal_id: text foreign key to goals
- logical_date: ISO date text
- local_time: nullable HH:MM:SS text
- entry_id: nullable text foreign key to entries
- source_system: nullable text
- source_id: nullable text
- created_at and updated_at: timestamps
- unique constraint on goal_id and logical_date

### import_runs

- id: text primary key
- source_system: text
- source_sha256: text, unique
- source_version: nullable text
- status: dry_run, applying, completed, or failed
- report_json: text
- started_at and completed_at: timestamps

Do not store the raw backup payload or photos in D1. Store only the fingerprint and reconciliation report.

### Required indexes

- entries on logical_date descending, excluding deleted records where supported.
- activities on group_id, archived_at, and sort_order.
- activity_groups on archived_at and sort_order.
- goals on archived_at and sort_order.
- goal_completions on logical_date and on goal_id plus logical_date.
- source_system plus source_id on every imported entity table.

Enable foreign-key enforcement and test cascade/restrict behavior explicitly. Prefer restricting deletion and using archive or soft-delete fields so historical meaning is preserved.

## 9. Domain rules

- Logical dates use ISO YYYY-MM-DD strings and are not inferred from save timestamps.
- The date picker defaults to today. If yesterday has no entry, show a prominent Log yesterday shortcut, but never silently change the selected date.
- An entry requires one valid mood.
- Activities may be empty, although the imported data always contains at least one.
- Archived groups, activities, and goals remain resolvable for historical records but are hidden from new-entry selection by default.
- Saving an entry replaces its complete activity selection for that date.
- Goal completion is independent data. The UI may offer a convenience link between a goal and its activity, but it must not silently rewrite historical completion state.
- All writes return the new server representation and version.
- Entry updates require the caller's expected version. A stale version returns HTTP 409 with the current server record.
- Deleting an entry is a soft delete. Restoring it should be possible through the API even if restoration UI is deferred.
- Store and display dates using local calendar semantics. Do not let JavaScript UTC conversion move a logical date.

## 10. API contract

All successful responses use a consistent envelope with data and optional metadata. All failures use an error object containing code, message, and optional field details. Validate every path, query, and JSON body at runtime.

### Bootstrap and entries

- GET /api/bootstrap
  - Returns mood levels, active activity groups and activities, active goals, today's entry, yesterday's entry, and goal completion state for those dates.
- GET /api/entries
  - Supports before, from, to, and limit.
  - Defaults to a small recent page.
- GET /api/entries/:logicalDate
  - Returns one entry with selected activities and goal completion state.
- PUT /api/entries/:logicalDate
  - Creates or replaces the entry for that date.
  - Body: moodId, activityIds, localTime, timezone, timezoneOffsetMinutes, completedGoalIds, and expectedVersion.
  - Perform the entry write, join-table replacement, and goal-completion changes in one D1 batch transaction.
- DELETE /api/entries/:logicalDate
  - Soft-deletes the entry and requires expectedVersion.

### Catalog management

- POST /api/activity-groups
- PATCH /api/activity-groups/:id
- POST /api/activities
- PATCH /api/activities/:id
- POST /api/goals
- PATCH /api/goals/:id

PATCH operations cover renaming, ordering, grouping, icon assignment, schedule changes, and archive/unarchive state. Reject an operation that would make a historical foreign key invalid.

### Goal completion

- PUT /api/goal-completions/:logicalDate
  - Replaces the completed goal set for one date without requiring an entry.

### Portability and operations

- GET /api/export
  - Downloads a versioned JSON document containing all domain tables and export metadata.
- GET /api/health
  - Returns application version and database reachability, but no private counts or content.

Do not expose the Daylio import endpoint permanently unless the final importer design needs one. A local administrative import command is preferable for this single-user, one-time migration.

## 11. UI and interaction plan

### Primary navigation

Keep navigation to three destinations:

- Log
- Entries
- Settings

Statistics is not shown as a disabled tab.

### Log screen

The Log screen is the primary product:

1. Date control with Today, Yesterday, and calendar actions.
2. Existing-entry warning when the chosen date already has a record.
3. Five large mood buttons.
4. Activity search that filters across all groups.
5. Collapsible activity groups preserving imported order.
6. Clear selected state, selected count, and an optional selected-only view.
7. Goal checklist for goals scheduled or relevant on that date.
8. Sticky Save entry action reachable with one thumb.
9. Saved confirmation containing the exact logical date.

If the chosen date already has an entry, the screen edits that entry rather than creating a duplicate.

Persist the current unsaved draft in localStorage keyed by logical date. Clear it only after the server confirms the save.

### Entries screen

- Show recent entries in descending logical-date order.
- Each row shows date, mood, a compact activity summary, and completed-goal count.
- Selecting a row opens it in the same add/edit screen.
- Include pagination or Load older; do not render the complete history initially.
- Include a delete action behind a confirmation.

No statistics, calendar heatmap, or full-text search is required.

### Settings screen

- Activity groups: create, rename, reorder, archive, and restore.
- Activities: create, rename, change icon/group/order, archive, and restore.
- Goals: create, edit schedule, reorder, archive, and restore.
- Export data.
- Import status summary showing the source fingerprint and verified totals after migration.
- App version and sign-out link.

### Accessibility and mobile behavior

- Minimum 44 by 44 CSS pixel touch targets.
- All mood and activity controls are real buttons with accessible names and pressed state.
- Do not communicate mood or selection only through color.
- Support reduced motion and browser font scaling.
- Keep the Save button visible above Android browser or PWA safe-area insets.
- Test at narrow mobile widths and with a long list of activities.

## 12. Authentication and security

### Cloudflare Access

- Deploy on a custom hostname in a Cloudflare-managed domain.
- Create a self-hosted Access application covering the entire hostname.
- Create an Allow policy whose Include selector is the approved identity.
- Use Cloudflare identity-provider sign-in or email one-time PIN.
- Never use Login Methods: One-time PIN as the only Include rule; Cloudflare documents that this would allow any valid email user.
- Deny is the default. Do not create an Everyone or permanent Bypass rule.

### Worker validation

Access protection at the edge is necessary but not the only API check. For every /api request:

- Read the Cf-Access-Jwt-Assertion header.
- Verify its signature against the Access team's remote JWK set.
- Verify issuer and the application's audience tag.
- Reject missing or invalid assertions with 403.
- Optionally require the email claim to equal an ALLOWED_EMAIL environment variable as defense in depth.

Cloudflare currently recommends validating the assertion header rather than relying on the Access cookie.

Local development may bypass Access only when an explicit local-development flag is active. The deployed Worker must fail closed if Access configuration is missing.

### Additional controls

- Same-origin API only; do not enable permissive CORS.
- For mutations, require JSON content type and reject an unexpected Origin.
- Set a restrictive Content Security Policy and standard security headers.
- Do not include analytics, ad scripts, or third-party trackers.
- Do not log moods, activity names, notes, request bodies, exports, or authentication assertions.
- Use prepared D1 statements for every user-derived value.
- Return generic production errors while logging only a request ID and safe diagnostic category.

## 13. Daylio import design

The importer is a required product deliverable, not a disposable manual script.

### Inputs

- Required: ../private/backup.daylio
- Recommended audit input: ../private/daylio_export.csv
- Optional flags: dry run, apply, local database, remote database, and output report path.

The real input files stay outside the repository.

### Known source structure

- The .daylio file is a ZIP.
- It contains a Base64-encoded UTF-8 JSON file named backup.daylio.
- Its parsed root version is 15.
- It may also contain JPEG assets, which the MVP intentionally skips.
- Normal dayEntries months are zero-based.
- goalEntries months are one-based.
- Default mood names are represented by numeric predefined-name IDs.
- Activity and goal relationships use Daylio numeric IDs.

### Parsing phases

1. Compute SHA-256 of both supplied files.
2. Verify ZIP integrity and locate backup.daylio.
3. Base64-decode while tolerating whitespace, then parse JSON.
4. Validate root version and required collections before transforming anything.
5. Build source-ID maps for moods, groups, activities, entries, goals, and goal completions.
6. Normalize each collection with its own date decoder.
7. Preserve raw Daylio icon, repeat, and state values in source fields.
8. Preserve legacy notes and note titles.
9. Count photos and references but do not extract or import JPEG bytes.
10. Present Daylio goal state groups and recent completion dates in the report for review before activation.
11. Produce a dry-run report before any database write.

### Applying data

Apply in dependency order:

1. Mood levels.
2. Activity groups.
3. Activities.
4. Entries.
5. Entry/activity links.
6. Goals.
7. Goal completions.
8. Completed import-run record.

Use deterministic IDs and upserts. Apply bounded D1 batches so a large completion history does not exceed Worker or command limits. A failed batch must leave the import marked failed and safe to retry.

Prefer a local TypeScript command that parses and validates the backup, then writes through a narrowly scoped import adapter. If direct remote D1 execution is chosen, generate parameterized batches or carefully escaped temporary SQL inside a gitignored directory, verify locally first, and delete the private generated artifacts after migration approval.

Do not send the backup to an external model, analytics service, or third-party conversion site.

### Required reconciliation report

The dry run and post-import report must verify:

- Entry count and date coverage match the source audit.
- Logical dates contain no duplicates.
- Mood categories and activity mappings reconcile with the source audit.
- Configured-but-unused activities are retained when present.
- Goal definitions and completion rows reconcile with the source audit.
- Legacy note and note-title fields are preserved without exposing their contents.
- Optional scale, favorite, and photo fields are handled according to product scope.
- Zero differences from the CSV for date, local time, mood, and activity set.

Run the same report after database import. A second complete import must leave all totals unchanged.

### Private fixtures

Do not derive a committed fixture by merely truncating or pseudonymizing the source backup. Create synthetic fixtures that exercise:

- Zero-based day-entry months.
- One-based goal-entry months.
- Numeric predefined mood names.
- Duplicate activity names with distinct IDs.
- Archived and active records.
- A note without a title and a title with a note.
- Referenced and orphan asset metadata.
- An invalid date and an unknown source version.
- A retry of an already imported source ID.

The real backup can be used only for local, ignored acceptance testing.

## 14. PWA and connectivity behavior

- Provide a valid web app manifest, maskable and standard icons, theme color, start URL, and standalone display mode.
- Cache the built application shell and immutable fingerprinted assets.
- Use a network-first strategy for navigation so deployments update promptly.
- Do not service-worker-cache authenticated API data as the source of truth.
- Detect offline state before save and explain that the entry remains an unsaved local draft.
- If connectivity fails during save, retain the draft and present Retry.
- After reconnecting, refetch the selected logical date before retrying to prevent an accidental overwrite.
- Show a small update prompt when a new app shell is ready instead of forcibly reloading during entry editing.

Offline creation and background synchronization remain a separate future phase.

## 15. Export, backup, and recovery

The JSON export must:

- Have an explicit format version and creation timestamp.
- Include every domain record, including archived and soft-deleted records.
- Include source IDs and preserved legacy notes.
- Exclude authentication tokens and deployment secrets.
- Be deterministic enough for count and checksum comparison.

Add a documented production recovery runbook:

1. Export app JSON before a risky schema or import operation.
2. Confirm current D1 Time Travel availability and retention in the Cloudflare dashboard or CLI.
3. Apply migrations using Wrangler's D1 migration command, which creates a backup before applying.
4. Verify health and row totals after migration.
5. Know how to restore via D1 Time Travel.

The app-owned JSON export is the long-term escape hatch; D1 Time Travel is short-term operational recovery.

## 16. Test strategy

### Domain unit tests

- Logical-date parsing never shifts due to UTC.
- Today/yesterday selection around midnight.
- Goal schedule eligibility for daily, selected-weekday, and N-times-per-week schedules.
- Duplicate activity names remain distinct by ID.
- Entry version conflict detection.

### Importer tests

- Every synthetic format edge case listed above.
- Deterministic IDs.
- Dry run performs no writes.
- Apply order respects foreign keys.
- Batch failure is retryable.
- Idempotent second import.
- CSV reconciliation catches one changed mood, time, date, or activity.

### Database and Worker tests

- Migrations apply to a clean local D1 database.
- Foreign keys and uniqueness constraints behave as intended.
- Entry save is atomic.
- Entry replacement removes deselected activity links.
- Soft-deleted entries are absent from ordinary lists but exportable.
- All API validation and status codes.
- Missing, invalid, wrong-issuer, and wrong-audience Access assertions are rejected.
- Local auth bypass cannot activate in a production configuration.

### React interaction tests

- Create and edit an entry.
- Switch between today and yesterday without losing the correct draft.
- Search and select activities with duplicate names.
- Save-error and offline states retain the draft.
- Archived activities remain visible on old entries but not in new selection lists.
- Keyboard and accessible-name coverage for all interactive controls.

### Manual acceptance

- Chrome on Android, installed PWA mode.
- Narrow phone screen with browser font scaling.
- Production Access login and sign-out.
- Unauthorized email denied.
- First real entry created, edited, and exported.
- Complete source-data import and reconciliation.

## 17. Implementation phases

Each phase should end with passing tests and a small reviewable commit. Do not deploy or import private production data until the user explicitly authorizes those external changes.

### Phase 0: scaffold and guardrails

- Create the current Cloudflare React + Vite Worker scaffold with pnpm.
- Establish the repository layout, formatting, typecheck, tests, and build.
- Add privacy-focused .gitignore rules before touching exports.
- Add a basic Worker health route and React shell.
- Record all commands in README.

Exit condition: local frontend and Worker API run together; test, typecheck, and build pass.

### Phase 1: schema and migration proof

- Write the initial D1 migration and repository layer.
- Implement the Daylio parser, normalized domain objects, CSV comparator, and dry-run report.
- Import the supplied backup into local D1 only.
- Prove all known counts, zero CSV differences, and idempotency.
- Review the imported goal-state mapping before production import.
- Adjust the schema now if real data exposes a mismatch.

Exit condition: the supplied private backup passes the complete local acceptance report twice with unchanged totals.

### Phase 2: core API

- Implement authentication middleware with a testable local mode.
- Implement bootstrap, entries, goal completions, and export endpoints.
- Add atomic entry saves and optimistic version checks.
- Add API and local-D1 integration tests.

Exit condition: the complete daily workflow works through API tests without the React UI.

### Phase 3: replacement-loop UI

- Build the mobile app shell and Log screen.
- Build activity groups, activity search, mood selection, date selection, goals, and sticky save.
- Add draft preservation, offline messaging, and conflict handling.
- Build the recent Entries screen and edit/delete flow.

Exit condition: the end-of-day workflow can be completed against local D1 from a phone-sized browser.

### Phase 4: configuration and portability

- Build activity/group and goal management.
- Add Material Symbols mapping and fallback behavior.
- Build versioned JSON export.
- Add import status display.
- Complete accessibility and long-list performance checks.

Exit condition: the app can be maintained without returning to Daylio.

### Phase 5: PWA, production, and Access

- Add manifest, app icons, service worker, update behavior, and offline shell.
- Create production D1 and apply migrations.
- Deploy the Worker and static assets to the chosen hostname.
- Configure Access for the approved identity.
- Configure and verify JWT issuer, audience, and email checks.
- Confirm unauthorized access fails.

Exit condition: the protected app is installable and the empty production database passes smoke tests.

### Phase 6: migration and cutover

- Take a fresh Daylio backup and CSV if Daylio has received new entries since the last import.
- Dry-run the freshest files and review the report.
- Export the empty/current app database before applying.
- Import to production only after explicit confirmation.
- Re-run the full report against production.
- Enter and export one new test day, then either retain or remove it intentionally.
- Keep Daylio installed and untouched until at least one week of successful replacement use.

Exit condition: production totals reconcile, new daily use works, and a current app-owned JSON export has been saved.

## 18. Deployment prerequisites and required values

The implementing model can finish all local phases without these. Before Phase 5, it needs:

- A Cloudflare account.
- A domain managed by Cloudflare and the desired app hostname.
- The identity allowed by Access.
- Preferred sign-in method: Cloudflare identity or email OTP.
- Permission to create the D1 database, deploy the Worker, and configure Access.

If no Cloudflare-managed domain is available, stop before production deployment and agree on an authentication alternative. Do not silently replace Access with a shared password.

## 19. Decisions intentionally defaulted for implementation

To keep the handoff executable:

- Preserve all legacy notes in the database.
- Skip all JPEG bytes.
- Keep all raw Daylio goal state/repeat values even if the UI mapping is incomplete.
- Treat state 0 as the initial candidate for active goals only after a fixture or visible behavior confirms it; until then, import the raw state without destructive normalization.
- Assign a generic Material symbol when a Daylio numeric icon lacks a reviewed mapping.
- Use one entry per date.
- Require a network connection to save.
- Start with manual deployment from a developer machine; automate CI deployment only after production is stable.

## 20. Instructions to the implementing model

1. Read this plan and DAYLIO_DISCOVERY.md before changing files.
2. Inspect current Cloudflare scaffolding and documentation rather than copying stale commands from memory.
3. Work phase by phase and keep scope within the MVP.
4. Ask before adding production dependencies.
5. Add tests with every feature.
6. Keep JavaScript and TypeScript functions with many inputs on a single options object.
7. Never commit, print, upload, or log the source Daylio contents.
8. Never mutate remote Cloudflare resources or import production data without explicit permission.
9. Treat the private backup as acceptance evidence, not a repository fixture.
10. Report verified results separately from manual follow-up and unimplemented post-MVP work.

## 21. Post-MVP backlog

Only start these after the replacement loop has been used successfully:

- Basic mood distribution and trend views.
- Activity frequency and simple activity/mood correlations.
- Calendar overview and search.
- Richer icon reassignment.
- Offline write queue and conflict-safe synchronization.
- Native app evaluation, likely through a separate client reusing the HTTP API.
- Importing or displaying historical photos.
- Note authoring, scales, audio, themes, and advanced Daylio features.

## 22. Current official Cloudflare references

- React + Vite on Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- Worker static assets and SPA routing: https://developers.cloudflare.com/workers/static-assets/
- D1 Worker binding API: https://developers.cloudflare.com/d1/worker-api/
- D1 batch transactions: https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 migrations through Wrangler: https://developers.cloudflare.com/d1/wrangler-commands/
- D1 import and export: https://developers.cloudflare.com/d1/best-practices/import-export-data/
- Cloudflare Access policies: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
- Cloudflare Access one-time PIN: https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- Cloudflare Access JWT validation: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

Recheck these references at implementation time because Cloudflare tooling and dashboard labels change.

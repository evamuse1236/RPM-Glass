# Web planner sync

The server is the hub. The website saves each change on the server at once (`convex/plannerWrite.ts`). The phone keeps a full copy that works offline. It pushes its own changes and pulls everyone else's (`android-companion/replica-sync.mjs`, `SyncManager.java`, `PlannerCommandHost.java`).

Planner data lives in `plannerRecords`: one row per task, Block, Project, Area, Goal, week, review, body setting, Capture and conflict. A snapshot is built from these rows when a browser asks for it. Nothing stores whole snapshots.

## When two edits meet

The newer change wins. Each record group carries a time stamp, so a phone title and a website note on the same task both survive. The losing version is kept in two places: a line in the task's notes, and a `conflict:<uuid>` record that the snapshot lists under `conflicts`. The website shows each one as a note the user can dismiss. A delete and an edit follow the same rule; the edited value is kept.

The phone freezes its outbox before a push. An edit made while the push is on the network keeps its own stamp and goes out in the next push, so it meets the same rule.

## Snapshot and commands

`web/contract/snapshot.schema.json` and `web/contract/command.schema.json` are JSON Schema draft 7 contracts. Unknown fields are rejected at every level. The snapshot has `schemaVersion: 2`, `revision`, `savedAt`, `entries`, `planner`, `captures` and `conflicts`, plus the older `tasks`, `blocks`, `projects`, `areas`, `goals`, `drafts` and `body` summaries. Credentials, tokens, traces, Undo, model payloads, conversations, memories and history never leave the phone.

`web/fixtures/snapshot.json` is the `rpmctl seed` data (`scripts/gauntlet/seed.mjs`) on 19 October 2026 in Asia/Kolkata. Regenerate it with `node scripts/web-sync/snapshot-fixture.mjs`.

A command is `{id, type, args, baseRevision, createdAt}`. Make a fresh UUID for each action. Send the exact same body to retry. Reusing an ID with different content returns 409.

| Type | Args |
|---|---|
| `plan` | `{op}`, one `editPlan` op from `plan-ops.schema.json` |
| `capture` | `{text}`, the exact words, at most 12,000 characters; optional top-level `timezone` |
| `complete`, `uncomplete` | `{taskId, occurrence?}` |
| `reschedule` | `{taskId, time, day}`; one may be set, or both null to clear |
| `edit` | `{taskId, fields}` with `title`, `notes`, `time`, `minutes` or `alert` |
| `move-to-block` | `{taskId, blockId}`; null moves to Inbox |
| `archive`, `restore` | `{taskId}`; archive is recoverable Trash |
| `log-water` | `{at}` |
| `log-meal` | `{name, slot, at}`; slot is breakfast, lunch, snack or dinner |
| `undo` | `{commandId}` of an applied command |

`plan` ops are the phone's own `editPlan` ops, including `batch`, `groupTasks`, `reviewProgress` and `finishReview`. Model and draft ops (`aiDraft`, `acceptDraft`, `dismissDraft`) and planner `undo` are refused, also inside a batch. A Project, Block or other record made in the browser keeps the UUID the browser gave it.

Undo reverses one browser command. If a later edit touched the same records, Undo answers `conflict` with "This changed since; Undo it on the phone after reviewing."

## Browser HTTP API

The base URL is the deployment's `.convex.site` URL. Every response has `Cache-Control: no-store`. Requests use `Authorization: Bearer <64-hex-token>`. The server stores only a SHA-256 hash of the token.

| Method and path | Request | Response |
|---|---|---|
| `POST /v1/web/link` | `{code, label?}` | `{token, sessionId, accountId, protocol: 1}` |
| `GET /v1/web/snapshot` | Optional `If-None-Match` | Snapshot and `ETag: "rpm-<revision>"`; 304 if unchanged |
| `POST /v1/web/commands` | One command | `{id, status, message, newRevision, cursor}` |
| `GET /v1/web/commands?since=0` | Server cursor | `{commands, cursor, hasMore}`, up to 100 per page |
| `DELETE /v1/web/session` | No body | `{revoked: true}` |

A plan or task command comes back final: `applied`, `rejected` or `conflict`. A Capture comes back `pending` (HTTP 202) with "Words saved. Waiting for Capture." and turns final when the server finishes it. Final status never changes. Page the status list while `hasMore` is true, and keep its cursor only after the page is handled.

Errors are `{error: {code, message}}`: 400 bad JSON or schema, 401 bad or revoked token, 403 origin not allowed, 404 no snapshot yet, 409 reused command ID, 413 body over 1 MB, 429 quota with `Retry-After`, 503 service error.

## Phone HTTP API

Phone routes use the paired device token, never a browser token.

| Method and path | Request | Response |
|---|---|---|
| `POST /v1/planner/push` | `{seq, part, final, changes}`; up to 200 changes and 800 KB | `{seq, part, results: [{key, rev, value}]}` |
| `POST /v1/planner/pull` | `{after, limit}`; limit up to 500 | `{rows, cursor, hasMore, seededAt}` |
| `POST /v1/planner/sync` | Anything | 410 `upgrade_required`; an old app must update |
| `POST /v1/web/link-code` | `{}` | `{code, expiresAt}` |
| `GET /v1/web/sessions` | None | `{sessions: [{id, label, createdAt, lastSeenAt, revoked}]}` |
| `POST /v1/web/revoke` | `{sessionId}` | `{revoked: true}` |

Each change carries its key, the base revision and value it was made on, and its group stamps. A push replayed with the same `seq` and `part` returns the first receipt, so a lost response never applies twice. The first push of a new phone seeds the account only on its final part.

The open app syncs on open, every 20 seconds, and one second after a saved change. In the background Android runs it about every 15 minutes, later under Doze or battery limits. The background run uses the same bundled JavaScript in a headless WebView (`android-companion/sync-runtime.mjs`) and saves through the normal native save bridge. An idle sync writes nothing, and a save that meets a newer version reloads and retries.

## Capture from the website

The server saves the exact words first, as a `captures` row and a `capture:<id>` record. Then a worker (`convex/captureWorker.ts`, `captureRun.ts`) runs the same Capture agent the phone uses, in the user's time zone (Asia/Kolkata if none is sent). A failed run is tried again, up to three attempts; after that the words stay saved and the command ends with a retry message. If Capture needs an answer, its question shows on the Capture note, and the next words go to the same conversation. The model key is the deployment's `ANTHROPIC_API_KEY`.

Capture typed on the phone still runs on the phone.

## Link codes, CORS and quotas

A link code has eight characters from an unambiguous uppercase alphabet. It lasts ten minutes and works once. The phone shows it under Settings, Cloud, Link a web browser, which also lists browsers with last-seen times and a revoke control. A new code cancels earlier unused codes. A revoked browser can't write; work it already saved stays saved.

`RPM_WEB_ORIGIN` sets the allowed production origin, such as `https://planner.example.com`. Local runs also allow `http://localhost` and `http://127.0.0.1` with an explicit port. Preflight allows Authorization, Content-Type and If-None-Match. There is no wildcard origin and no cookie. Each token gets 120 operations a minute; a malformed request fails before it is counted. Link attempts have a global limit of 30 a minute.

## Old data

The `plannerSnapshots` table left the schema. Convex 1.48.0 deploys without it even when rows exist: it drops the index and keeps the rows, unread (tested on a local backend, 2026-10-27). Don't add a table by that name back with a different shape, or the old rows may fail validation.

## The website

`web/app/` runs the phone's own planner (`android-companion/planner.mjs`) through `mountPlanner`, with the same screens, ops and stylesheets. The design is in `docs/web-site-design.md` and the feature list in `docs/web-site-parity.md`.

- `plan-queue.mjs` shows a change at once and sends it as one command on the revision the user saw.
- `sync-marks.mjs` marks a row "Saving" until the server's answer and the newer snapshot arrive. A refused change shows the reason on its row.
- `conflict-notes.mjs` and `capture-notes.mjs` show conflicts and Capture progress as notes.
- `web-native.mjs` answers the planner's native calls; calendar reads say not connected.
- An unsent command stays in the browser's outbox and is resent with the same ID and body.

### Run it locally

`npm run web:local` starts a local Convex, pairs a stand-in phone, makes the Site key, builds, and serves the Site on `http://127.0.0.1:5179/`. It refuses to run if `.env.local` names a cloud deployment. Logs go to `.verify/web-sync/`. The stand-in (`scripts/web-sync/phone-standin.mjs`) runs the phone's own replica sync on the `rpmctl` seed.

`npm run web:drive -- --no-code --site http://127.0.0.1:5179/` drives every planner feature in headless Chrome. Screenshots at 412px and 1280px go to `.verify/evidence/web-<time>/`. The checks are `scripts/web-sync/drive-*.mjs`, one file per area.

On a phone or emulator, `rpmctl scenario web-sync-offline` proves an offline phone edit and a website edit meet the conflict rule.

### Hosting on ChatGPT Sites

ChatGPT sign-in already limits a private Site to its owner, so the Site holds the browser key and the page opens straight to the planner.

1. `npm run web:build` (with `RPM_SYNC_SERVER` unset) writes `web/dist-site/server/index.js`, a Sites Worker with the page's files inside it. It answers `/v1/site` and forwards `/v1/*` to the sync server. When the page sends `Bearer site`, the Worker adds the Site's key. The key never reaches the page, and the page can't revoke it.
2. `npx convex run admin:createWebSession '{"label":"ChatGPT Site"}'` makes that key for the phone that synced last. The phone lists and revokes it like any linked browser. After a phone pairs again, make a new key.
3. On the Site, set `RPM_SYNC_SERVER` to the deployment's `.convex.site` URL and `RPM_WEB_TOKEN` (secret) to the key. No CORS setting is needed, because the Worker calls Convex server to server.
4. Without `RPM_WEB_TOKEN` the page shows the link-code screen, and the Worker passes the code's token through. `npm run web:phone -- --link-code` prints a code for a local test.

Other hosts: build with `RPM_SYNC_SERVER` set to the `.convex.site` URL, serve `web/dist`, and set `RPM_WEB_ORIGIN` on Convex to the site's origin.

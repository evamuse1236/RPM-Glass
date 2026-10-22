# Web planner sync v2

The phone is the only writer of planner data. A browser reads a snapshot and queues commands. A queued command is not a saved planner change. The phone applies it with the same planner operations and Capture entry point that a tap uses, then publishes the result.

## JSON contracts

`web/contract/snapshot.schema.json` and `web/contract/command.schema.json` are JSON Schema draft 7 contracts. Unknown fields are rejected at every object boundary. Times are RFC 3339 instants with offsets. A day is `YYYY-MM-DD`. Task IDs are positive integers; planner entity IDs are strings. Revisions are nonnegative safe integers from the phone's companion store version.

The snapshot has `schemaVersion: 2`, `revision`, `savedAt`, `entries`, `planner` and `captures`. `entries` is the store-shaped plan-task list, including recurrence days, alert type/lead, completions and review choices. `planner` contains `schema`, `reviewVersion`, `uxVersion`, `blocks`, `projects`, `areas`, `goals`, `context`, `weeks`, `reviews`, `body`, `drafts` and `events`. Routine runs retain their step-ID-keyed marks; meal state and safe nutrition summaries survive. Drafts expose summaries only. `events` is always empty: the planner does not read its private mutation log. `reviewActivityDays` is a task's compact activity-day summary for weekly review; revision payloads stay local.

The legacy `tasks`, `blocks`, `projects`, `areas`, `goals`, `drafts` and `body` summaries remain temporarily so the existing Site and old command types work without UI edits. New runtimes read `entries` and `planner` directly. Blocks' titles are Results; task completion does not establish achievement. Missing body settings use phone defaults. Captures expose only the latest 50 exact texts, statuses and receipt lines. Credentials, tokens, traces, Undo, model payloads, conversations, memories and history are excluded by deep projection and validation, including map values. Java additionally checks the v2 field boundaries before upload.

`web/fixtures/snapshot.json` projects the same `scripts/gauntlet/seed.mjs` data used by `rpmctl seed`, anchored to 19 October 2026 in Asia/Kolkata. The seed has no Capture journal or unaccepted drafts, so those lists are empty. The fixture is synthetic, not an export of a person's phone. Regenerate it with `node scripts/web-sync/snapshot-fixture.mjs`.

Commands have `{id, type, args, baseRevision, createdAt}`. Generate a fresh UUID for an action; retry the exact same body with that UUID. `baseRevision` is the snapshot revision the user acted on. Reusing an ID with different content returns HTTP 409. The following table defines `args`.

| Type | Args |
|---|---|
| `plan` | `{op}` using the allowlisted `editPlan` JSON op (see below) |
| `capture` | `{text}` with exact raw words, at most 12,000 characters |
| `complete`, `uncomplete` | `{taskId, occurrence?}` for an optional recurring occurrence |
| `reschedule` | `{taskId, time, day}`; exactly one may be non-null, both null clears scheduling |
| `edit` | `{taskId, fields}`; one or more of `title`, `notes`, `time`, `minutes`, `alert` |
| `move-to-block` | `{taskId, blockId}`; null moves to Inbox |
| `archive`, `restore` | `{taskId}`; archive means recoverable Trash |
| `log-water` | `{at}` |
| `log-meal` | `{name, slot, at}`; slot is breakfast, lunch, snack, or dinner |
| `undo` | `{commandId}` identifying an applied command |

`plan` uses the same `editPlan(data, op, clock())` as a phone tap. Its exact variants are in `plan-ops.schema.json` (`$defs.planOp`, referenced by `command.schema.json`) and `validate.d.mts` (`PlanOp`). They cover task edits/reopening/archive/restore/move/reorder, existing-Block sorting, entity edits/removal, Block archive, Area ratings, context, all `BODY_OPS`, and review decisions/progress. `aiDraft`, `acceptDraft`, `dismissDraft` and `undo` are rejected, including inside batches. Browser Undo uses the existing `undo` command and its durable receipt/guard.

The new ops are:

- `{type: 'batch', ops: [op, ...], keepUndo?: boolean}`: 1–60 non-batch, non-progress ops, atomic with one Undo. A child cannot contain a function or a model/draft/Undo op on the wire.
- `{type: 'groupTasks', ids: [taskId, ...], blockId: string | null}` or `{type: 'groupTasks', ids: [taskId, ...], newBlock: {title, purpose?, projectId?}}`: move several tasks, optionally creating one shared Block, with one Undo.
- `{type: 'reviewProgress', week: 'YYYY-MM-DD', patch: {step?, finishedAt?, focusDraft?, inboxIds?, keptIds?, clashes?}}`: quiet navigation progress, retaining the last plan Undo. `step` is 1–4, `finishedAt` an instant or null, `focusDraft` up to five Block IDs or null, ID lists are task IDs, and `clashes` maps clash IDs to `a`, `b` or `later`.
- `{type: 'finishReview', week: 'YYYY-MM-DD', ids: [blockId, ...]}`: set up to five Results and finish progress as one plan change.

Every leaf op accepts optional `keepUndo: boolean`, used for saves such as nutrition estimates which retain the prior Undo. Quiet progress and an op with `keepUndo: true` do not earn a browser Undo receipt for someone else's earlier change. The phone runtime and planner commit reject executable mutators; an AST regression test also checks every direct planner commit/review-run call.

`targets(op)` names task/entity/group, context, week/review, routine/run, water-setting, meal/guess and meal-slot records. The phone compares whole public target records, including priority groups and unlink cascades. New records and water/meal logs need no retained base. Other ops conflict if their base is unavailable or a target changed; unrelated records can change independently.

The phone rejects invalid operations and reports conflicts when relevant target state differs from the base snapshot. Unrelated changes may proceed. An unavailable base revision is a conflict for edits that need comparison. Capture and new water or meal logs are additive. Undo is guarded against later changes and never restores an old whole planner over newer phone edits. The phone persists command results with local changes before acknowledging, so a lost HTTP response cannot apply a task edit twice. Capture reuses a stable message ID and its normal saved journal on retries.

## Browser HTTP API

The base URL is the deployment's `.convex.site` URL. All responses have `Cache-Control: no-store`. Authenticated requests use `Authorization: Bearer <64-hex-token>`. The token is returned once, then stored only as a SHA-256 hash on the server. Treat it as a secret. Browser clients decide how to store their token; the backend never sets a password or cookie.

| Method and path | Request | Response |
|---|---|---|
| `POST /v1/web/link` | `{code, label?}` | `{token, sessionId, accountId, protocol: 1}` |
| `GET /v1/web/snapshot` | Optional `If-None-Match` | Snapshot JSON and `ETag: "rpm-<revision>"`; HTTP 304 without a body if unchanged |
| `POST /v1/web/commands` | One command | `{id, status, message, newRevision, cursor}`; HTTP 202 when queued |
| `GET /v1/web/commands?since=0` | Nonnegative server cursor | `{commands: [...], cursor, hasMore}` ordered by status-change cursor, up to 100 per page |
| `DELETE /v1/web/session` | No body | `{revoked: true}` |

An initial command response has `status: "pending"`, `message: "Waiting for phone"`, and `newRevision: null`. Final statuses are `applied`, `rejected`, or `conflict`, with a human-readable `message` and the phone's `newRevision`. Final status is immutable. Cursors advance both on enqueue and on acknowledgement. Poll the status endpoint again while `hasMore` is true; persist its returned cursor only after processing the page. Commands remain scoped to their account and originating session. A revoked browser cannot read or submit commands. Commands queued by a browser that is revoked before execution are rejected rather than executed.

No snapshot yet returns HTTP 404. Invalid JSON or schema returns 400. Invalid, expired, used, or revoked credentials return 401. Disallowed browser origins return 403. Conflicting command identity or phone snapshot ownership returns 409. Request bodies over 1 MB return 413. Exhausted token quota returns 429 with `Retry-After`. Unexpected service errors return 503. Errors have `{error: {code, message}}`; clients must not treat an error as acknowledgement.

## Phone HTTP API

Phone endpoints use the existing paired device token, never a browser token.

| Method and path | Request | Response |
|---|---|---|
| `POST /v1/planner/sync` | `{snapshot?, acks: [{id, status, message, newRevision}]}` | `{commands, snapshots, revokedCommandIds}`; up to 100 oldest pending commands and five retained snapshots for base comparison |
| `POST /v1/web/link-code` | `{}` | `{code, expiresAt}` |
| `GET /v1/web/sessions` | None | `{sessions: [{id, label, createdAt, lastSeenAt, revoked}]}` |
| `POST /v1/web/revoke` | `{sessionId}` | `{revoked: true}` |

The code has eight characters from an unambiguous uppercase alphabet. It expires after ten minutes and works once. The phone shows it under Settings, Cloud, Link a web browser. That dialog lists browser sessions with last-seen times and revocation controls. Minting a new code invalidates earlier unused codes for that phone. Linking grants access to the same account and identifies that phone as the command executor. The legacy admin pairing code and diagnostic pairing remain separate.

The phone processes one command, saves and acknowledges its result, then refreshes the pending queue before starting another. A sync run processes at most 20 commands. `revokedCommandIds` identifies commands whose browser was revoked. The phone checks its durable receipt first and rejects an unstarted revoked command without running it. An operation already processing may finish or resume after interruption. This preserves the true outcome when revocation races a saved change or a lost acknowledgement. The server keeps the command pending until the phone supplies that outcome.

## Timing and offline behavior

An open phone app requests a sync on open, about every 20 seconds, and one second after saved planner changes. The existing Android JobScheduler path requests background work every 15 minutes. This project does not use WorkManager. Android may defer jobs for connectivity, battery limits, Doze, or force-stop. Background command processing uses the same bundled JavaScript operations and phone model bridge in a headless WebView.

Expected online latency is roughly 1 to 20 seconds plus network and operation time while the app is open, plus the browser's polling interval. Capture also waits for its model. In the background, expect 15 minutes or longer; this is not a delivery deadline. An offline or force-stopped phone leaves browser commands pending. The web must display `savedAt` and pending state honestly. It must wait for `applied` and the new snapshot before reporting a saved change.

## Accounts, retention, and security

Deployment adds an optional account ID to existing devices. On pairing or first planner access, a transaction creates one account for that installation and assigns it without changing its token, events, or legacy records. Re-pairing preserves the account. Existing installation-specific events and records remain intact. No existing data is reinterpreted as a planner snapshot. The first successful planner sync creates the first web snapshot.

Each account has one authoritative device and one current snapshot with up to four older snapshots for safety and conflict comparison. The cloud rejects browser snapshot writes, cross-account access, decreasing revisions, and a different payload for an already published revision. Browser commands never write planner collections directly. Snapshots are validated on the phone and server. Local command receipts remain durable across transport retries.

`RPM_WEB_ORIGIN` specifies the allowed production origin, such as `https://planner.example.com`. Local development also allows HTTP origins on localhost and 127.0.0.1 with an explicit port. Responses vary by Origin and expose ETag. Preflight allows Authorization, Content-Type, and If-None-Match. No wildcard origin or credentialed cookies are enabled. Authenticated planner and browser endpoints allow 120 validated operations per token per minute. Malformed requests fail validation before quota charging. Link exchanges also have a global bound of 30 attempts per minute to limit code guessing. The phone can revoke each browser independently. No AI credential leaves the phone.

This feature requires a Convex deployment and `RPM_WEB_ORIGIN` configuration before live use. The build brief explicitly excludes deployment, emulator, and phone verification. Automated tests prove local contracts and transport behavior; live end-to-end sync and the Cloud dialog remain UNVERIFIED until the orchestrator verifies them.

## The website

`web/app/` runs the phone's own planner (`android-companion/planner.mjs`) in the browser through `mountPlanner`. It has the same screens, the same `editPlan` ops and the same stylesheets. The design is in `docs/web-site-design.md`, and the feature list in `docs/web-site-parity.md`. On screens 600px and wider the planner sits in a 720px column.

- `plan-queue.mjs` lays the browser's unsent ops over the phone's snapshot with `editPlan`, so a change shows at once. Each op goes to the phone as one `plan` command on the revision the user saw.
- `sync-marks.mjs` marks a row "Waiting for your phone" until the phone applies the op and the newer snapshot arrives. A refused op shows the phone's words on that row. A note at the top counts the waiting changes.
- `web-native.mjs` answers the planner's native calls: Capture opens the Site's typed Capture, calendar reads say not connected, and model calls say the AI runs on the phone.
- The Site's menu items (Check for changes, and Unlink for a browser linked with a code) join the planner's More menu through `mountPlanner({menuItems})`.
- Unsent commands stay in the browser's outbox and are resent with the same command ID and body.

### Run it locally

`npm run web:local` starts a local Convex, pairs a fresh stand-in phone, makes the Site key after the phone pairs, builds, and serves the Site on `http://127.0.0.1:5179/`. Logs go to `.verify/web-sync/`. The stand-in runs the phone's own command code (`web-sync-commands.mjs`) on the `rpmctl` seed; its Capture model files the exact words as one task, and no AI service is called.

`npm run web:drive -- --no-code --site http://127.0.0.1:5179/` drives every planner feature in a headless Chrome. Each check confirms that the stand-in phone saved the change and that the page settled. Screenshots at 412px and 1280px go to `.verify/evidence/web-<time>/`. The checks live in `scripts/web-sync/drive-*.mjs`, one file per area.

A Site key belongs to the phone that synced last when the key was made. After a phone pairs again, make a new key; an old key reads the old phone. `web:local` does this for you.

### Hosting on ChatGPT Sites

ChatGPT sign-in already limits a private Site to its owner, so the Site holds the browser key and the page opens straight to the planner.

1. `npm run web:build` (with `RPM_SYNC_SERVER` unset) writes `web/dist-site/server/index.js`, a Sites Worker with the page's files inside it. It answers `/v1/site` and forwards `/v1/*` to the sync server. When the page sends `Bearer site`, the Worker adds the Site's key. The key never reaches the page, and the page can't revoke it.
2. `npx convex run admin:createWebSession '{"label":"ChatGPT Site"}'` makes that key for the phone that synced last. The phone lists and revokes it like any linked browser.
3. On the Site, set `RPM_SYNC_SERVER` to the deployment's `.convex.site` URL and `RPM_WEB_TOKEN` (secret) to the key. No CORS setting is needed, because the Worker calls Convex server to server.
4. Without `RPM_WEB_TOKEN` the page shows the link-code screen, and the Worker passes the code's token through. `npm run web:phone -- --link-code` prints a code for a local test.

Other hosts: build with `RPM_SYNC_SERVER` set to the `.convex.site` URL, serve `web/dist`, and set `RPM_WEB_ORIGIN` on Convex to the site's origin.

# Web planner sync v1

The phone is the only writer of planner data. A browser reads a snapshot and queues commands. A queued command is not a saved planner change. The phone applies it with the same planner operations and Capture entry point that a tap uses, then publishes the result.

## JSON contracts

`web/contract/snapshot.schema.json` and `web/contract/command.schema.json` are JSON Schema draft 7 contracts. Unknown fields are rejected at every object boundary. Times are RFC 3339 instants with offsets. A day is `YYYY-MM-DD`. Task IDs are positive integers; planner entity IDs are strings. Revisions are nonnegative safe integers from the phone's companion store version.

The snapshot has `schemaVersion: 1`, `revision`, `savedAt`, `tasks`, `blocks`, `projects`, `areas`, `goals`, `drafts`, `captures`, and `body`. Blocks' titles are Results; their `purpose` is the reason. Tasks retain `raw`, `must`, and `priority`. Completing a task does not establish that a Result was achieved. Archived tasks retain `archiveDisposition` for Trash and restore. `body` includes water settings and glasses, meals, the meal plan, routines, and runs. Missing body settings use the phone's defaults. Captures include only the latest 50 texts, statuses, and receipt text lines. Drafts expose summaries, not executable model instructions. Credentials, tokens, traces, undo snapshots, model payloads, and conversation history are excluded by projection and validation.

`web/fixtures/snapshot.json` projects the same `scripts/gauntlet/seed.mjs` data used by `rpmctl seed`, anchored to 19 October 2026 in Asia/Kolkata. The seed has no Capture journal or unaccepted drafts, so those lists are empty. The fixture is synthetic, not an export of a person's phone.

Commands have `{id, type, args, baseRevision, createdAt}`. Generate a fresh UUID for an action; retry the exact same body with that UUID. `baseRevision` is the snapshot revision the user acted on. Reusing an ID with different content returns HTTP 409. The following table defines `args`.

| Type | Args |
|---|---|
| `capture` | `{text}` with exact raw words, at most 12,000 characters |
| `complete`, `uncomplete` | `{taskId, occurrence?}` for an optional recurring occurrence |
| `reschedule` | `{taskId, time, day}`; exactly one may be non-null, both null clears scheduling |
| `edit` | `{taskId, fields}`; one or more of `title`, `notes`, `time`, `minutes`, `alert` |
| `move-to-block` | `{taskId, blockId}`; null moves to Inbox |
| `archive`, `restore` | `{taskId}`; archive means recoverable Trash |
| `log-water` | `{at}` |
| `log-meal` | `{name, slot, at}`; slot is breakfast, lunch, snack, or dinner |
| `undo` | `{commandId}` identifying an applied command |

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

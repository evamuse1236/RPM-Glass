# RPM Convex backend

The phone saves into SQLite and a transactional outbox first, then uploads batches
through HTTPS HTTP actions. A retry reuses the same event IDs. Convex acknowledges
only committed batches and keeps both an append-only event stream and current
record snapshots. Reordered uploads cannot replace a newer snapshot.

Legacy collection write endpoints require a per-installation token acquired with a one-use,
30-minute pairing code. Tokens are random, stored hashed server-side, and are
revocable. No deployment/admin key ships in the APK. Internal admin functions
can be invoked only with deployment administrator credentials, not mobile clients.

After provisioning/deploying with the Convex CLI:

```bash
npx convex run admin:createPairingCode '{"label":"Galaxy S24 FE"}' --prod
```

On the phone, use **More → Cloud sync**, enter the deployment's `.convex.site`
URL and the returned code once. Pair the emulator with a separate code/device
label to keep test data identifiable. Owner access to data is through the Convex
dashboard/CLI. The legacy collection upload does not restore a new phone from cloud data.

`records` contains the latest `entries`, `projects`, and `revisions` snapshots.
`events` retains every acknowledged upload. Neither endpoint is a public data feed.
Incomplete drafts and authentication credentials are not part of synced records.

Do not call `admin:revokeDevice` except for an installation you intend to disconnect.
A new pairing for the same installation rotates its token while keeping its data.

## Planner web sync

The phone publishes a validated planner snapshot through `/v1/planner/sync`.
Browsers exchange a phone-issued eight-character code for an independent hashed
token, read that account's snapshot, and queue commands for its authoritative phone.
Only the phone applies planner changes and acknowledges command results. Accounts
are added lazily to existing devices without changing their legacy events or records.
Revoking a browser immediately disables its token. A command already running on
the trusted phone may finish and publish its acknowledgement and snapshot. The
next phone pull rejects remaining commands from that browser in batches of 100.
The phone executes and acknowledges one command before refreshing its queue.

Set `RPM_WEB_ORIGIN` to the exact production browser origin before live use.
HTTP localhost and 127.0.0.1 origins require an explicit development port.
Planner requests allow 120 requests per authenticated token per minute. Link
exchanges have a global limit of 30 attempts per minute. Both use fixed windows
and return HTTP 429 with `Retry-After` when exhausted.

See [the complete HTTP contracts](../docs/web-sync.md) for endpoints, cursor
polling, revision retention, revocation, and offline behavior. Local Convex tests
cover transport and storage behavior. Deployment and live phone/browser sync need
separate verification.

## Diagnostic logging

The independent `/v1/diagnostics` endpoint stores console and operation records with 14-day retention. Reads and pairing-code creation are internal administrator functions. Existing paired device credentials are accepted without modifying planner records; diagnostic-only pairing cannot authorize `/v1/sync`. See [diagnostic logging](../docs/diagnostic-logging.md) for phone controls, queries, limits and verification.

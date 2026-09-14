# RPM Convex collection backend

The phone saves into SQLite and a transactional outbox first, then uploads batches
through HTTPS HTTP actions. A retry reuses the same event IDs. Convex acknowledges
only committed batches and keeps both an append-only event stream and current
record snapshots. Reordered uploads cannot replace a newer snapshot.

All write endpoints require a per-installation token acquired with a one-use,
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
dashboard/CLI. This version uploads automatically; it does not merge remote edits
back into the phone or restore a new phone from cloud data.

`records` contains the latest `entries`, `projects`, and `revisions` snapshots.
`events` retains every acknowledged upload. Neither endpoint is a public data feed.
Incomplete drafts and authentication credentials are not part of synced records.

Do not call `admin:revokeDevice` except for an installation you intend to disconnect.
A new pairing for the same installation rotates its token while keeping its data.

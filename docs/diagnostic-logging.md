# RPM diagnostic logging

RPM uploads app console messages, JavaScript exceptions/unhandled rejections, native crash reports, and structured operation outcomes to the private Convex diagnostics table. Console arguments can contain personal captures; Dara explicitly selected full console content on 2026-09-27. The logger does not mirror companion.json or invoke legacy planner synchronization.

## Connection and controls

The production target is `vishwajit1236:rpm:prod`, HTTP base `https://neat-emu-821.convex.site`. Existing paired RPM installations use their encrypted native cloud credential for diagnostics when this build runs. Fresh installs stay disconnected until a diagnostic pairing code is entered in Planner → Settings → Diagnostics. Connecting this path cannot enable legacy planner sync. Diagnostics has Pause, Resume, Upload queued logs, and Disconnect controls. Disconnect clears the local queue and prevents fallback to the old connection; it does not delete logs already uploaded. A request already in transit can finish after pausing.

Generate a one-use code on the authorized administrator machine:

```sh
node scripts/diagnostics.mjs pair --label 'Galaxy S24 FE diagnostics'
```

The code expires after 30 minutes. Enter it only in the secure native dialog; it is never included in the APK or passed to JavaScript. Device credentials are encrypted by Android Keystore; the backend stores hashes. Only deployment administrators can query records. Diagnostic-only credentials cannot write legacy planner records. Existing device credentials remain subject to `admin:revokeDevice`; diagnostic credentials use:

```sh
node scripts/diagnostics.mjs devices
node scripts/diagnostics.mjs revoke --installation INSTALLATION_UUID
```

## Inspecting a failure

```sh
node scripts/diagnostics.mjs inspect --level error --limit 50
node scripts/diagnostics.mjs inspect --version 0.19-glass-diagnostics --outcome error
node scripts/diagnostics.mjs inspect --session SESSION_ID
node scripts/diagnostics.mjs inspect --operation OPERATION_ID
node scripts/diagnostics.mjs inspect --since 2026-09-27T00:00:00Z
```

The commands return the full authorized content. Use `continueCursor` as `--cursor` for the next page, including when a filtered page is empty but `isDone` is false. The CLI scans at most 1,000 candidate rows per page. Console and native call records share a WebView session ID. Capture/retry/action outcomes use explicit message or action IDs; native model calls preserve their transport request IDs. They are not claimed to form a distributed trace automatically. Start with the capture outcome, inspect relevant intent records, then use the session to inspect its native calls. A session may contain concurrent operations.

The event fields include release, source kind, level, occurrence/receipt time, session and operation IDs, outcome, and payload. Native payloads add Android version, device model and process session. Operation records distinguish successful completion, failure, cancellation, and UI dispatch. A console message alone is not proof that an operation completed. Capture failures returned as values are recorded as failures.

## Delivery and limits

- No probabilistic sampling of captured console messages. Standard log/debug/info/warn/error, trace/assert/table/dir, grouping, timers and counters are wrapped while preserving local console output. This captures the bundled app console, not all Android logcat or other applications.
- Full console refers to the authorized content category, subject to bounds: argument snapshots limit depth, keys and payload bytes; oversized records contain a truncation marker. Credentials are redacted before disk and again during ingestion. Native code also removes exact current API/device credentials. The WebView never receives raw keys.
- SQLite keeps up to 2,000 records or 2 MiB. On overflow it evicts routine records before warnings/errors; a dropped counter is shown in Settings. The bounded native writer can reject excess work; that counter lasts for the process. Capture disabled by Pause is intentionally not buffered.
- Uploads batch at most 20 records / 192 KB, after roughly 5 seconds while the process runs. Persistent Android jobs retry when a network is available and periodically at 15-minute intervals. Android may defer them for battery/Doze restrictions. Transient failures back off from 30 seconds to 15 minutes. Revocation pauses uploads until pairing is repaired; invalid batches remain queued with an error status.
- Acknowledged IDs are deleted only after a successful database commit. Retries are idempotent; conflicting reused IDs are rejected. New records survive an older batch acknowledgement.
- Remote queries show the last 14 days by receipt time. An hourly job removes expired rows in bounded batches. This is application retention, not a statement about provider backups. Locally expired queue rows are pruned as new records are added.

The reusable [diagnostic-logging skill](/home/darax/.codex/skills/diagnostic-logging/SKILL.md) was informed by [Logging Sucks](https://loggingsucks.com/). RPM uses its operation-context guidance alongside the specifically requested full-console channel. No ongoing Codex monitoring task is created by enabling app uploads.

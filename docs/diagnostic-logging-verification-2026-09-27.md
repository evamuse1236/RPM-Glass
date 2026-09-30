# Diagnostic logging and Capture delivery — 2026-09-27

## Delivered stages

- Capture glass redesign implemented and previously verified across 73 native fixture assertions and 17 rendered states; the Opus design plan and detailed Capture results are in `docs/capture-glass-plan-2026-09-27.md` and `docs/capture-glass-verification-2026-09-27.md`.
- Private diagnostic backend deployed to the existing RPM production deployment, `vishwajit1236:rpm:prod` (`neat-emu-821`). Existing planner tables and endpoints remain separate. Deployment added diagnostic tables/indexes, pairing/ingestion routes, internal inspection functions, and scheduled retention cleanup. No indexes were removed.
- Version 19 / `0.19-glass-diagnostics` built, signed, and installed on the dedicated disposable API 36 emulator `RPM_DIAGNOSTICS` / `emulator-5556`. The installed APK's SHA-256 matches `output/RPM-0.19-glass-diagnostics.apk`. The signing certificate matches the earlier Capture APK. All 13 bundled companion assets match their source-generated files.
- No physical phone was connected or modified. No commit or push was made; concurrent parser/planner changes were preserved in the working tree and are included in the combined build.
- The reusable skill is installed at `/home/darax/.codex/skills/diagnostic-logging/SKILL.md`, with automatic discovery and `$diagnostic-logging` invocation. Structural validation passed; its guidance was applied to this implementation.

## Verification

| Check | Verified result |
| --- | --- |
| JavaScript regression suite | 410 passed |
| Convex tests | 16 passed, including auth, secret redaction, idempotency, conflict/size rejection, revocation, queries and retention |
| Cloud TypeScript | Passed |
| Android build, test APK and lint | Passed |
| Native diagnostic storage | 14 checks passed: redaction, content preservation, reopen/retry identity, partial acknowledgement safety, concurrent arrival preservation, size/row bounds and loss counters |
| Native companion checks | 61 passed on the fresh emulator; notification-dependent branches differ from the earlier configured emulator |
| Existing native offline checks | 38 passed |
| Live console delivery | Four console/exception/rejection records survived an offline app restart; exact event IDs found in production; full synthetic capture text preserved and test credential absent |
| Pause / resume | Capture and upload pause; queued rows remain; new records appear after resume |
| App-process crash | Forced crash by exact application PID persisted its stack before termination; exact event found in production after restart |
| WebView renderer crash | Forced renderer exit persisted a crash event through `onRenderProcessGone`; exact event found in production after restart |
| Revocation / disconnect | Revoking only the test installation stopped uploads and retained the queue; Disconnect then cleared the queue and disabled automatic connection fallback |
| Settings rendering | Dark and light views inspected at normal and 200% text; no horizontal overflow |
| Final APK Capture smoke | Actual long press opens menu; release preserves draft; bottom Planner opens; returning preserves the exact draft |
| Contrast / whitespace | Capture token checks and `git diff --check` passed |

Only synthetic fixtures were submitted during delivery checks; no paid model call was made. Early probes exposed a renderer-crash logging gap, now covered by the native callback and live regression check. An initial upload assertion incorrectly required an empty queue while lifecycle records could arrive concurrently; the test now checks acknowledged IDs on the normal serialized upload executor. Live database receipts independently establish delivery. Immediate probes during activity/network startup were retried after readiness.

## Evidence and limits

Evidence is in the ignored `output/diagnostics-2026-09-27/` directory: `artifact.json`, `installed-receipt.json`, `signature.txt`, `deploy.log`, test logs, `offline-receipt.json`, `live-receipt.json`, `crash-receipt.json`, `pause-receipt.json`, `revocation-device.json`, `capture-smoke.json`, and `screens/`. Earlier unsuccessful probe output is retained as diagnostic evidence, not counted as passing verification.

The test credential was revoked and the disposable emulator disconnected before shutdown. Existing Galaxy S24 FE cloud credentials were not changed. The old Capture QA restored its original 61 private files byte-for-byte; this diagnostic pass used an independent fresh AVD. No test data needed restoring to a phone.

One test setup initially started an additional emulator under memory pressure. A kernel OOM event killed an emulator and interrupted the app session. After resuming, checks used a single isolated emulator. The interruption is not evidence of an RPM application crash.

Android can defer background uploads; these checks do not establish physical-phone battery behavior, continuous lossless capture, TalkBack behavior, or on-device animation smoothness. Sampling is disabled but declared queue/record limits still apply. App Java crashes and WebView renderer termination are covered; arbitrary OS process kills and native signals need not run the Java handler. The database is ready; ongoing personal-phone logs require running the new APK with a valid existing connection or diagnostic pairing.

See `docs/diagnostic-logging.md` for privacy scope, retention, limits, activation and inspection commands.

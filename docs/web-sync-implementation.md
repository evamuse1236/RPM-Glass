# Web sync implementation and verification

The backend implements the contract in [web-sync.md](web-sync.md). The contract and synthetic verify-seed fixture were committed first in `79b49ff`. The web UI remains a separate task.

## Ownership and design decisions

The phone's `companion.json` remains authoritative. `buildSnapshot` projects declared fields, and both HTTP ingress and the phone validate against the committed JSON schemas. Existing stores get a stable saved timestamp from their file modification time until their next save. Subsequent saves persist `syncSavedAt` alongside the normal revision. Snapshots contain current planner data, not the companion store's private recovery or model state.

Two execution options were considered. A new embedded JavaScript engine would require another Android dependency and replacements for browser APIs. A headless WebView uses the same environment as the existing planner. The chosen separate `sync-runtime.mjs` entry imports the existing planner editor and Capture agent without starting the visible runtime or mounting UI. Native Java owns HTTPS and model credentials. The headless page receives no key or token.

The existing background path is JobScheduler, not WorkManager. `RpmApplication` tracks foreground activities for a shared 20-second poll. Saved changes request a debounced sync after one second. The existing 15-minute periodic job remains subject to Android scheduling and connectivity. These intervals are configured behavior, not measured live latency.

The native runner processes and acknowledges one command at a time, with at most 20 per sync. It refreshes the pending queue after each acknowledgement. Local receipts share the versioned save with planner effects. Capture uses stable IDs through its normal journal and agent. SHA-256 guards prevent command Undo from overwriting a newer plan or conversation state.

The phone pull contract adds `revokedCommandIds`. Without this metadata, server-side cancellation could label a command rejected after the phone had saved its effect and lost its acknowledgement. The phone checks its durable receipt first. Fresh revoked commands are rejected without model or planner effects; an already-processing operation may finish or resume. The server records the phone's outcome.

Account migration adds an optional account reference to each existing device. Pairing or first authenticated planner access creates the account transactionally. Device IDs, hashed tokens, legacy events, and records survive. Legacy uploads continue if the separate planner path is unavailable. Re-pairing preserves the account. New installation restore is outside this contract.

Browser codes and tokens are stored hashed. Link codes work once and expire in ten minutes. Account ownership, revocation, ETags, CORS, command identity, terminal status, and quotas are checked in the server path. Each native network request captures its deployment and encrypted credential together; a changed connection invalidates its response.

The phone UI adds a Cloud group with one Link a web browser row in existing Settings styling. It opens Cloud pairing if necessary or a native dialog with the code, expiry, browser labels, last-seen times, and revoke controls. Cloud reports the local planner revision and whether it has uploaded. No planner or web UI was redesigned.

## Verification stage

`npm test` covers JavaScript, rule checks, Convex HTTP fixtures, TypeScript, and the existing plain-JVM checks. The new tests cover every command, Capture and its Undo using the real agent with a fixture model, conflicts, lost responses, process recreation, revocation races, schema validation, and credential exclusion.

`gradlew.bat -q :app:testDebugUnitTest` runs the Android host unit tests, including `SyncManagerTest`. The native transport tests cover pull and acknowledgement, connection changes, per-command acknowledgement, revocation refresh, private-field rejection, timing, and legacy acknowledgement validation.

`web-sync-runtime.test.mjs` bundles the actual headless entry and executes it with eval disabled and a simulated native bridge. It verifies startup, versioned saves, duplicate delivery, and cancelled commands. This is fixture-backed integration evidence, not an Android WebView test.

The independent review was single-family GPT-only. Its findings about version-conflict propagation, paired credential consistency, legacy-path isolation, revocation races, and stale completion after a day-only reschedule were resolved. The completion and reopening regression also protects against a renamed task.

The build brief prohibits emulator, phone, push, merge, and deployment work. Live browser-to-phone sync, the rendered Cloud dialog at phone and enlarged-text sizes, Android headless execution, real background delivery, model service calls, Samsung behavior, and the home-screen widget remain **UNVERIFIED**. No screenshot evidence is claimed. `npm run check:evidence` remains unsatisfied because it requires the excluded device screenshots.

## Deployment handoff

The Convex schema and new HTTP functions must be deployed before live use. Set `RPM_WEB_ORIGIN` to the web app's exact origin. Localhost development origins are also allowed. Existing phone pairing remains valid and migrates lazily. The updated Android build must then be installed and the orchestrator must drive linking, snapshot read, each command, Undo, conflict, revocation, foreground polling, and background recovery on the real app. No deployment or installation was performed in this task.

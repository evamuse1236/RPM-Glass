# Capture response and follow-up repair — 28 September 2026

**Implemented, tested on an isolated emulator, and installed on Dara’s Galaxy S24 FE over wireless ADB.** Package `com.rpm.prototype` is now versionCode **20**, versionName **0.20-adaptive-capture**, upgraded from version 18 without uninstalling or clearing data. The current branch remains `codex/purpose-first-ux`; no commit, push, or external APK delivery was performed in this step. Existing planner, routing and diagnostics work in the shared working tree was preserved in the build.

## What changed

Capture now shows one current response as a structured card. The original words remain in Details. A same-day range shows the date once and **2 pm to 3 pm · 1 hr**, with calendar/clock cues. Date-only captures say Time not set; cross-day and DST ranges retain the information needed to distinguish endpoints. Only meaningful proposed fields are visible. Saved and undone states replace the proposal, with Undo/Open in Planner where available. Earlier captures and Classic messages are accessible through More → History → conversation.

The native sheet measures its content, grows upward and shrinks again. New responses start at the top; refreshes preserve an open disclosure and the reader’s position. Actions stay above the composer. Very long content remains scrollable downward at the screen/keyboard limit, with More below. The composer is compact when empty and expands for writing. Text awaiting a result and unsent words now have an ordered native private-store copy as well as the existing WebView mirror; a forced process exit does not discard them.

The [surface contract](capture-response-plan-2026-09-28.md) records the completed Opus 5.5 medium Batch consultation and the deliberate implementation adjustments. The approved widget crops were the only new image evidence uploaded for that review. This consultation cost $0.082646; cumulative with the preceding Capture consultation, $0.255924. Advice and billing evidence are retained locally under `output/capture-response-2026-09-28/batch-review/`.

## Recent chat failure: evidence and repair

The private phone journal showed two semantic failures after a Wispr/bot idea:

1. “Just make it into a project for now and leave it be” used none reasoning and unnecessarily asked which item the user meant.
2. “The task I just mentioned to you before” used none followed by high repair and proposed a project titled **Finish one WID assessment**, an unrelated saved task. Its generic reference was accepted as exact-string evidence for that title. This proposal had not been committed.

A point-in-time reconstruction using the installed version’s context builder confirmed that the Wispr thought was present for both calls. This was not missing network data or an absent conversation history. The model’s internal reason cannot be established from the output. The verified application weaknesses were the fast routing of referential requests, no explicit prompt rule distinguishing recent ideas from saved-item candidates, and evidence validation that accepted a substring without checking this particular wrong-title selection.

The repair:

- Referential follow-ups use GPT-6 Luna **high** directly. Clear standalone extraction still uses **none**. The bounded repair allowance, exact model ID and OpenAI provider pinning remain.
- The prompt resolves references against the nearest relevant user thought or explicitly focused draft. A request for one project creates a proposal for one project, without invented tasks/goals/times. Ambiguity can remain a question with no operations.
- Recent conversation receives retrieval budget before broad saved-task matches. Future messages cannot contaminate an earlier capture’s retry.
- A local guard rejects copying an unrelated saved title into a new referential proposal and rejects unsupported “stated” provenance for a title inferred from earlier dialogue. A suggested title is still reviewable, not an automatic write. An explicit title supplied now or a structured user edit remains authoritative.
- The same guard checks old uncommitted drafts at presentation and commit. The existing wrong project displays **Check this draft**, explains the mismatch, and offers Edit/Dismiss without Add. Its original record is preserved. No Wispr project was silently created and no real task was changed during verification.

This guard covers the observed failure pattern; it is not a general proof of semantic correctness. A small live replay is evidence for these cases, not a fresh model-frontier benchmark.

## Verification

| Check | Result |
| --- | --- |
| JavaScript suite | **423 passed**, including 7 new follow-up regressions; failing-before evidence retained |
| Java parser/correction suite | **23 passed** |
| Android debug/test APK build and lint | Passed with JDK 17 / SDK 36 |
| Android integration | **113 passed**: 61 companion, 14 diagnostics, 38 offline/persistence/widget/reminder |
| Native Capture UI | **272 assertions**, **31 layouts**, owned credential-free emulator with synthetic records |
| Cold process-restart recovery | **10 checks passed**, including unsent and in-flight words and ordered native writes |
| Physical Galaxy S24 FE UI | **15 checks passed**, using the actual saved records read-only |
| Live model follow-ups | **4/4 passed**, **4 calls**, total reported cost **$0.00207798525** |
| Token/contrast and whitespace checks | Passed; scoped dark card muted text adjusted for composited contrast |

The native matrix covers light/dark, normal/200% text, actual IME open/closed, short/long titles, ranges, date-only, unscheduled, multiple tasks, ambiguity, reflection, long replies, failures, historical bad drafts, Save/Undo, idempotent retry, Details, History, menu/hold-Send, Planner return, waiting and reduced motion. Actual rendered screenshots were inspected. The physical phone separately verified the first title is visible with SwiftKey open, actions/composer fit, native Details expansion/contraction, retained History, the real saved range’s compact format, and native Planner navigation.

Live cases used the phone’s native credential bridge and the production JavaScript service against **in-memory copies**, with no new personal capture or canonical store mutation:

| Case | Effort | Result | End-to-end time |
| --- | --- | --- | --- |
| Make the preceding idea a project | high | One Wispr/bot project proposal | 4.392 s |
| Clarify “the task I just mentioned” | high | One Wispr/bot project proposal | 7.612 s |
| Explicitly name the older WID task | none | One correctly named project proposal | 2.035 s |
| Ambiguous choice between two ideas | high | Question; no draft | 2.369 s |

All responses reported `openai/gpt-6-luna` through provider `OpenAI`. All four in-memory canonical stores remained unchanged. The earlier full 73-case routing evaluation remains historical evidence in [routing implementation](parser-2026-09-27/routing-implementation.md); it was not repeated here.

## Installation and preservation

Before installing, the package, version and signing certificate were checked. A private 53-file backup covered files, preferences, databases and WebView data. `adb install -r` preserved the app UID **10338**, all **16 entries**, **1 conversation**, **5 captures**, **2 drafts**, credentials and settings. The 191,109-byte canonical companion store matched the backup byte-for-byte after install, launch, physical UI checks and live requests; its version stayed 99. Of the existing private files, 52 were byte-identical immediately after install. The remaining change was the existing sync preference’s `last_success` timestamp advancing on package update. No diagnostic integration was newly activated.

Release artifact: `output/RPM-0.20-adaptive-capture.apk`.

- APK SHA-256: `f28212130732c535768a38729bd1735f935b7df3c76fc4d714edd0a691198462`
- Signing certificate SHA-256: `525fee39663b1984f55e3f7367eb783968166009a0210293bc4b0b4e8fb00bf1` (matches installed version 18)
- Generated WebView assets were byte-matched to their packaged files.

Machine-readable results, source hashes, build/test logs and synthetic screenshots are under `output/capture-response-2026-09-28/`. Phone backups, exact private replays and screenshots remain in a mode-0700 local subdirectory with mode-0600 files. No raw credential was read or included in a model prompt. Wireless ADB remains connected for subsequent authorized checks.

## Limits and test-environment issues

The enlarged-text matrix used the emulator; the phone retained its own display/font settings. Physical TalkBack, spoken/dictated input quality, audible alarms and future notification delivery were not tested in this release. No claim of final human design approval follows from a passed layout assertion.

The owned emulator initially failed with native `RenderThread` SIGSEGVs under SwiftShader, verified in host coredumps. Restarting with host GPU rendering and Vulkan disabled allowed the complete matrix to finish; these were emulator-process failures, not app crash evidence. The owned synthetic emulator is stopped after checks. No personal emulator store was overwritten and no global ADB server restart was used.

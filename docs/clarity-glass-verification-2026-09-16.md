# RPM 0.12 — Clarity and Glass

Two Sol implementation agents integrated the supplied kits into the current Android app, preserving the pre-existing v0.11 changes. The kits' preview apps and installers were not copied over the working application.

## Result

- Clarity: Agenda by default with Timeline available, readable result/purpose/action grouping, explicit checkboxes and adjacent estimates, System/Light/Dark and solid-navigation settings, responsive navigation and keyboard/focus treatment.
- Glass: an optional review-first capture path in **Settings → Thought capture**. Exact source is durable before AI interpretation. Revision-specific actions approve a draft, corrections preserve siblings, receipts prevent duplicate saves, and Undo restores the approved transaction.
- Sorting: suggestions are persisted separately from plans; only Apply rearranges tasks. Dismiss leaves canonical task groups unchanged. Existing legacy arrangements are not reapplied.
- Dates: previews and commits share the existing local time resolver, including saved-date inheritance. Older timed drafts require an explicit date refresh and another Save.
- Native integration: request-specific network cancellation, import parking of unapproved drafts, invalidation of imported action receipts, and existing alert-disarming behavior.

Classic remains the default because its check-ins, app controls and memory commands exceed the pilot's planning schema. Glass never falls back silently to a path that writes. The existing Context and export flows remain available. Extended memory approval/deletion/retention, conceptual target-picker continuations and automatic low-risk saves from the kit's later roadmap are not enabled by this release.

## Automated and live evidence

Baseline before edits: **182 existing Node tests passed**.

Final results: **285 Node tests**, **23 parser checks**, **63 native companion checks**, and **38 native persistence/widget/reminder checks** passed. The real-repository adapter smoke test passed. Android `assembleDebug`, `lintDebug` and `assembleDebugAndroidTest` passed. The final resize adjustment was followed by 53 relevant planner/settings/composer tests and a fresh APK build. Commands used:

```sh
node --test android-companion/*.test.mjs chat-prototype/*.test.mjs cli/*.test.mjs intent-v2/test/*.test.mjs
node intent-v2/scripts/test-in-repo.mjs .
bash scripts/test-parser.sh
bash scripts/build-debug.sh
adb shell am instrument -w -e companion verify com.rpm.prototype.test/com.rpm.prototype.OfflineTests
adb shell am instrument -w com.rpm.prototype.test/com.rpm.prototype.OfflineTests
```

The standalone `ModelRequestsTest` also exercised queued cancellation, cancellation of only the selected request, duplicate IDs, stale completions and Activity shutdown: **10 checks passed**. A real emulator request cancelled through `cancelModel` returned its cancellation acknowledgement and rejected the selected model call in **287 ms** while an independent synthetic evaluation continued.

### Model evaluation

Date: 16 September 2026. Route: `openai/gpt-5.6-luna`, existing native encrypted-key transport. All model inputs were isolated synthetic records; the evaluation did not commit plans or send private app context.

| Trial | Cases | Contract pass | Median | p95 |
|---|---:|---:|---:|---:|
| Original kit smoke | 6 | 6 | 3,059 ms | 3,882 ms |
| Original kit full set | 66 | 62 | 3,503 ms | 7,986 ms |
| Corrected prompt, failed cases | 4 | 4 | 4,097 ms | 9,209 ms |
| Final production prompt full set | 66 | 66 | 3,476 ms | 7,548 ms |

The four initial rejections concerned alert value types, an operation paired with `draftMode=none`, and a task incorrectly linked directly to a project. The semantic validator rejected them. The prompt now spells out allowed field types, entity relationships and review-state wording. Human inspection also found premature save/schedule wording in initial replies; final replies were inspected after adding clear draft examples.

The final set covered simple and compound captures, reflections, quoted instructions, time requests, corrections, preferences, RPM planning, queries, voice-style input and boundaries. The final 66 calls reported approximately **US$0.022913** in provider usage cost. Latencies measure one native model request plus local validation, not complete capture-to-save time. These are synthetic contract checks, not a calibrated real-world success rate. In particular, schema acceptance does not establish native parsing of every language or real calendar/notification delivery.

## Rendered review

Actual API 36 emulator; synthetic records. Ten populated planner views at 404 CSS pixels (five destinations in each palette) showed no whole-document horizontal overflow. Additional checks covered 352 CSS pixels with 200% Android text and 884 CSS pixels in landscape, Timeline, and a task editor with the Android keyboard visible. Save remained inside the available viewport.

The rendered review corrected the dark Life selected-horizon contrast and removed redundant Settings introduction copy at enlarged text. Scrollable large-text navigation targets were widened to contain their labels. A final resize fix keeps the selected tab fully visible when shrinking from 404 to 352 CSS pixels at 200% text; this was reproduced and verified on the final installed APK. Evidence is in `.impeccable/review/clarity-glass/` (local, ignored).

The existing 17-step planner journey passed: completion and Undo, explicit Move, no drag-based mutations, integrated Settings and Back, all selected destinations, and date-only saves.

### Glass on the actual Android WebView

The initial UI journey caught an undefined composer variable that module tests had missed. It was corrected, and a regression now executes the actual app script and composer handler, checking exact source, focused draft, retry identity and draft changes.

The installed APK then passed these synthetic journeys:

- A two-task request retained its exact leading/trailing spaces and created only a review draft.
- Edit focus survived force-stop/relaunch. A duration correction retained both operations and changed only the requested task to 20 minutes.
- A double Save tap created exactly two canonical tasks. Open selected the correct task and displayed both original source messages. Undo removed both tasks together.
- With Wi-Fi and mobile data disabled, raw text remained saved with a Retry action. It survived force-stop/relaunch. After restoring connectivity, Retry used the same message ID, added no duplicate source and did not commit a plan.
- A reflection received a conversational response without a draft or plan mutation.

## Preservation and rollback

The source baseline, including all previously uncommitted work, was copied to `/tmp/rpm-before-kits-20260916` before edits. Work is on `feat/clarity-glass-20260916`; no commit, reset, stash, PR or remote source publication was performed. The [exact task file list](clarity-glass-files-2026-09-16.md) compares against that snapshot rather than Git HEAD.

For capture rollback, select **Classic** under Thought capture. Preserve `intentV2` in exports: it contains original captured words and draft history. Already approved plans are ordinary canonical entries and should remain. Use Undo for a specific recent transaction rather than restoring an older whole store over subsequent work.

For source rollback, compare against the pre-task snapshot and restore only this task's changes, then rebuild. Do not reset the entire branch: v0.11 work existed before this task. Never uninstall or clear phone data merely to change versions.

The emulator's private files, preferences, WebView storage and databases were backed up before fixtures. All **65 original files were restored and SHA-256 matched**, with no extra files in the restored directories. Original font scale, rotation, display size, Wi-Fi and mobile-data state were restored. The app is stopped after restoration so the restored storage remains untouched.

Physical-phone behavior, TalkBack, tablet layouts, real account calendar coverage and real alert/audio delivery remain unverified.

## Package

- APK: `releases/rpm-0.12-clarity-glass.apk` (2,116,477 bytes); identical convenience copy at `output/RPM-Night-latest.apk`.
- Package: `com.rpm.prototype`, version code **12**, version **0.12-clarity-glass**.
- SHA-256: `65dd61edc005c1cd34b2797beeb8c2a33e170bdf92f99a2d2478b274ce8a10af`.
- APK v2 signature verified; certificate matches the v0.11 APK, allowing an in-place update. This remains the project's existing debug-signed distribution build.
- APK runtime and styles match generated source assets. No evaluation fixtures or test scripts are bundled.

## Delivery

Submitted the final APK as a document to the uniquely resolved **Noted** WhatsApp group on 16 September 2026 at 09:21 IST. Request ID: `ee5ba323-affe-49ee-bc4d-29c2ca8b7ca4`; message ID: `6628EEA8A64DE4F4DD9DEF724D292FA3`. The connector's returned hash matches the packaged APK. Status at submission: **submitted**, acknowledgement **pending**; delivery to every member and reading are not confirmed. The private send arguments are retained locally in `releases/rpm-0.12-clarity-glass-send.json` for duplicate-safe status checks.

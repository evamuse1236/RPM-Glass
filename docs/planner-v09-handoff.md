# RPM 0.9 — unified capture and planning

Completed 12 September 2026. All five phases in `planner-v09-phases.md` are complete. This release addresses the five reported problems; it does not claim the separate deferred RPM-ideas backlog is implemented.

## Installable update

- APK: `releases/rpm-0.9-unified.apk`, package `com.rpm.prototype`, version code 9, version name `0.9-unified`.
- SHA-256: `0ff1d19d3aef1b35576f1ba7308d456e618175dab59dd2d14750ee5f7d76936a`.
- Verified APK v2 signature, same existing Android debug certificate as 0.7/0.8: `525fee39663b1984f55e3f7367eb783968166009a0210293bc4b0b4e8fb00bf1`.
- This is a signed development/sideload build, not a production-store release. Install over the existing app; do not uninstall or clear storage. Export a backup in Settings first. Earlier release APKs remain unchanged.
- Installed and tested only on the owned API 36 emulator. No physical phone was installed or changed.

## What changed

1. Capture has real planner and app tools. It can read/search and create, edit, link, move, complete, reopen and recoverably delete tasks, RPM blocks, projects, life areas and yearly goals. Compound changes are one validated transaction with Undo. From a planner task/block/project, Capture carries that context and displays a clearable `In …` label. Ambiguous targets still require a question. Existing unfinished capture proposals remain continuable after upgrading.
2. The hierarchy is Day → RPM → Projects → Life. RPM is its own overview of all blocks plus Unsorted, including blocks outside a project. Projects contains block summaries and Life connects goals to projects.
3. Numbered drag handles support movement between blocks, including empty blocks, and priority ordering. Drop highlighting and edge scrolling show the destination. More → Move supplies a non-drag alternative.
4. Task rows have visible completion ticks and must stars. More → Delete task moves the task to Trash, stops its alerts, and offers Undo; RPM → Trash can restore it later. Deleting a group leaves its contents unassigned. Recurring completion advances the occurrence rather than deleting the series.
5. Both upper headers are gone. Bottom destinations are the selected date, RPM, Proj, Life and Settings. Tap the selected date again to choose a day, switch day-list/timeline, or inspect calendar status. Capture and Add are compact actions above the bar. Long details are available in the editor; short timeline cards show complete lines, not clipped fragments.

AI navigation opens the relevant screen; allowlisted direct settings changes wait for the native result. Sound selection, account connection, notification permissions, exact-alarm access and file import/export remain Android-controlled user interactions. “Whole app through AI” is not arbitrary device/shell access or permission to expose a key.

## Evidence

- 86 JavaScript tests passed. Native instrumentation: 50 companion checks and 38 original-app checks passed.
- Final Gradle build and lint succeeded: 0 errors, 26 warnings. Existing Gradle deprecation warnings remain.
- Live AI: contextual block+task creation; compound project rename/task move/must/duration/completion; life-area→goal→project linking; RPM navigation; native transparency change/readback; native alarm-picker opening. Exact saved IDs and fields were read back. No model/provider change.
- Manual/native: cross-block and empty-block drops, priority normalization, completion/Delete/Undo, non-drag Move, recurring occurrence completion, day/level gestures, task drafts and keyboard-safe Save. A date-only task retained its captured day through a details-only edit. QA changes survived in-place update and cold restart.
- Failure checks include invalid tool arguments, atomic rollback, legacy pending continuation, calendar-conflict recheck, and offline capture preserving words without creating records. Provider read-batch incompatibility was reproduced and corrected; live compound edits then passed.
- Rendered: 404px portrait, 358px narrow viewport, landscape, 200% Android text, real IME editor, and compact native capture. No tablet claim. The independent finish reviewer returned **ship**, with no unresolved material fixes after the short-card correction.
- Packaging: 46 APK entries; no private/test artifact paths, test classes, tested secret prefixes or QA fixture markers found. Three existing raster assets have provenance; none were added.

Detailed evidence: `planner-v09-verification.md`, `planner-v09-design-conformance.md`, and `../.impeccable/review/v09-finish-verdict.md`. The design skill influenced readable task controls, keyboard clearance, compact navigation, and the independent short-card correction. The global design files' pre-existing pixel-world drift was recorded without changing the user-pinned Frosted Night theme.

## Data and remaining user checks

The emulator's pre-test private store was backed up before QA and restored byte-for-byte afterward. Original two entries and pending conversation loaded under 0.9. Synthetic QA state remains recoverable in the emulator's separate private `companion-v09-qa-complete.json`; it is not packaged. The QA capture context was cleared. Font scale, size/density, orientation, connectivity and the original 47% transparency were restored. No material user data or earlier release was deleted.

On your phone, install this update over the existing app and check the five reported journeys with your own tasks. Real Samsung touch/keyboard behavior, selected alarm/reminder audio, notification delivery and battery restrictions still require that device; emulator evidence is not a claim of physical-phone acceptance. Existing read-only Google Calendar behavior is preserved; no Google event was written, new account connected, or personal context imported. AI still needs its configured connection and can ask for clarification or report a provider/network failure.

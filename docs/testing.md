# Verification and phone testing

## How to run the tests

Run `npm ci` once, then `npm test`. It needs Node 22 and a JDK 17 (`java` and `javac` on `PATH`, or `JAVA_HOME` set). The same command runs in CI on every push and pull request (`.github/workflows/test.yml`).

`npm test` runs, and stops at the first failure:

- `test:js`: every `node:test` file in `android-companion/`, `cli/`, `chat-prototype/` and `intent-v2/test/`. `scripts/test-tz.mjs` is preloaded and sets the timezone to Asia/Kolkata, so local-time tests give the same result on any machine.
- `test:cloud` and `typecheck:cloud`: the Convex sync and diagnostics tests (vitest) and `tsc --noEmit`.
- `test:java`: `scripts/test-parser.sh`, which compiles and runs the plain-JVM host tests in `tests/` (`CaptureParserTest`, `ModelRequestsTest`).

The device checks in `app/src/androidTest/` are not part of `npm test`. They need an emulator or phone and are run by hand before a phone release with `./gradlew connectedDebugAndroidTest`. `scripts/build-debug.sh` builds the debug APK, runs lint and assembles the test APK.

## Driving the real app

`npm test` does not open the app. To see a change on Android, use the `verify-rpm-glass` skill in `.claude/skills/verify-rpm-glass/`. Its CLI boots a read-only emulator sized like the Galaxy S24 FE, installs the debug build from this checkout, and drives Capture and the planner by accessible name:

```bash
node .claude/skills/verify-rpm-glass/rpmctl.mjs launch
node .claude/skills/verify-rpm-glass/rpmctl.mjs doctor
node .claude/skills/verify-rpm-glass/rpmctl.mjs scenario --all
node .claude/skills/verify-rpm-glass/rpmctl.mjs cleanup
```

`features/` in that folder holds one recipe per feature. Screenshots and saved-data readbacks go to `.verify/evidence/` (not tracked) and survive `cleanup`. `rpmctl doctor --serial <phone>` compares a connected phone's installed version and signing key with the local build without changing the phone.

## Verification history

The current **0.23-readable-capture** build is [verified and installed on the physical phone](capture-motion-fit-verification-2026-09-28.md). It includes the composited motion repair and the correction to the user’s keyboard-open frame: a complete readable update card, compact estimate, and no empty starter or duplicate instruction row. Current checks: 428 JavaScript tests, 272 native Capture assertions across 31 layouts, 22 focused fit/save/Undo checks, 28 motion checks, build/lint, physical screenshot inspection, exact installed APK verification and lossless app/draft preservation.

The **0.21-fluid-motion** build is [verified and installed on the physical Galaxy S24 FE over Wi-Fi](motion-verification-2026-09-28.md). It removes unchanged-view rebuilds and Capture compositor blanking, and adds interruptible navigation, sheet and panel motion. Verification includes 428 JavaScript tests, 272 Capture layout/journey assertions, 27 motion checks, 113 Android checks, cold recovery and 29 physical checks. Phone records remained byte-identical.

The **0.20-adaptive-capture** release is [verified and installed on the physical Galaxy S24 FE over Wi-Fi](capture-response-verification-2026-09-28.md). It includes the adaptive Capture cards, recent-follow-up safeguards, 423 JavaScript tests, 272 native UI assertions, 113 Android integration checks, 10 process-recovery checks, 15 physical UI checks and 4 successful live model cases. Canonical phone data remained byte-identical. Earlier records below describe their own historical verification scope.

The 0.18 model split and parser safeguards are recorded in [routing verification](parser-2026-09-27/routing-implementation.md): 401 JavaScript tests, 101 native checks, 28 Capture Save/Undo checks, successful completion of all 73 live fixture cases after fixes/retries, and byte-matched restoration of 65 emulator files after reboot. The report distinguishes the tested APK from concurrent diagnostics work and records Jev's remaining omissions. Physical-phone installation remains separate.

The 0.17 Capture glass redesign is recorded in [Capture verification](capture-glass-verification-2026-09-27.md): 398 JavaScript tests, 73 Capture UI fixture assertions, native save/Undo and Android checks, reviewed dark/light and enlarged-text renders, signed APK, and byte-verified emulator restoration. Physical-phone installation remains separate.

The 0.16 time-range repair is documented in [parser verification](parser-2026-09-27/verification.md): 353 JavaScript tests including 1,728 generated ranges, 63 native companion checks, 28 Capture checks at normal/doubled text, and the requested small live model comparison. The APK was verified on the owned emulator; physical-phone installation remains separate.

## Current purpose-first Android planner and Capture

Version 0.15-purpose-first implementation evidence is recorded in [the 26 September 2026 verification report](ux-2026-09-26/verification.md). That report covers 313 JavaScript tests, 63 companion checks, the retained 38 offline and 23 parser checks, 58 emulator UI assertions, 16 layout reports, the final 51-image matrix, migration on a two-entry emulator copy, byte-matched restoration of all 61 pre-QA private files, Android build/lint, and the signed APK artifact. Physical-phone installation, TalkBack, live model and speech quality, audible delivery, and external integration activation remain outside that verification.

Version 0.4 redesign checks are recorded in [redesign verification](design/redesign/verification.md). The following is the retained version 0.3 functional baseline, verified on 8 September 2026. All emulator records are synthetic and upload to the separate development deployment. The production deployment is reserved for your phone.

## Automated checks

- Pure Java parser/correction checks: **19 passed**. Includes local timezone conversion, AM/PM, invalid/past dates, unsupported weekdays, missing date/time, DST gaps, explicit duration, default estimates and narrowly scoped correction grammar.
- Android build, lint and test APK assembly: **passed** (JDK 17, SDK 36, Gradle 8.13).
- On-device integration checks: **38 passed**. Separate test database covers save/reopen, raw preservation, revisions, plan/check-in separation, completion/history, export, durable outbox and acknowledgements, HTTPS destination validation, widget inflation, and independent reminder/alarm identities.
- Convex tests: **8 passed**; TypeScript checking passed. Includes auth, one-use hashed pairing, idempotent retries including reordered JSON keys, out-of-order snapshots, atomic malformed-batch rejection, revocation and device isolation.
- Existing SQLite v1 data upgraded to v2 with both original entries and revisions preserved and queued for upload.
- Actual emulator pairing and automatic upload to Convex succeeded. With Wi-Fi/mobile data disabled, a check-in saved and queued two events; after reconnect it uploaded without manual Sync now. The backend retained null mood, energy and actual minutes. Queue reached zero. Pairing and local records survived app update and reboot.
- Created a result with purpose/life area, verified it in Convex, linked an action and marked it done: progress became 1 of 1 with the duration still explicitly estimated.
- Cloud status now refreshes while the screen is open, preserving input fields and distinguishing queued changes from Up to date.
- UI correction cancel and confirmation tested: the target changed from a 30-minute estimate to 20, retaining the raw input and previous snapshot. Check-in with Good mood and Medium energy saved those values while actual minutes remained unknown.
- Notification permission denial preserved the entry. Testing then granted notifications and exact-alarm permission using adb.
- A ringing alarm set through the date/time UI fired at 17:09. Android reported an active foreground service and MediaPlayer `state:started` with `USAGE_ALARM`. Its notification exposed Snooze and Dismiss. Snooze scheduled a new alarm exactly ten minutes later and stopped the active service. This headless emulator uses `-no-audio`; no claim is made that sound was heard.
- A real emulator reboot restored both the snoozed alarm and a separate notification reminder. The reminder subsequently posted and appeared in the notification shade. The snoozed alarm fired again at 17:19:37 from the launcher after both reboot and APK update; Dismiss stopped its foreground service and persisted the dismissed status.
- Home widget pinned successfully. Capture, Check in and Remind opened from its targets; Capture displayed over the real launcher. All four target views pass integration checks.
- Portrait Capture tested with keyboard visible at font scales 1.0 and 1.3. Landscape text entry retained a draft with Save visible; the stock keyboard did not remain visible in this landscape test. Samsung keyboard/IME behavior remains a phone check.
- Android document picker export produced parseable JSON containing 8 entries and all 14 revisions present at the time of export.

## Emulator scope

The user requested an emulator in the background and testing for the Samsung S24 screen. Tested a stock Android 16/API 36 emulator with **1080 × 2340** pixels, matching the [S24 FE display specification from Samsung](https://www.samsung.com/sg/smartphones/galaxy-s/galaxy-s24-fe-blue-256gb-sm-s721blbcxsp/). Density is a test setting, not a claim about the user's display zoom. Normal and enlarged text, portrait and landscape were checked.

An emulator matching resolution is not Samsung One UI. It cannot establish Samsung keyboard dictation availability, battery restrictions, launcher behavior or real-phone installation success.

## Galaxy S24 FE acceptance checklist

- Install the APK without uninstalling any app containing data. Export existing RPM data first if applicable. A signing mismatch is not permission to discard data.
- In airplane mode: save a thought, close the app, reopen and verify it is in History. Force-stop then reopen; verify records remain.
- “Tomorrow at 7 am, go for a run”: verify displayed date/time and estimate. No reminder should be scheduled automatically.
- “Actually, twenty”: confirm the target title is correct; cancel leaves it unchanged; confirm updates duration while Original input & revisions retains both values. A new thought is a separate record.
- Check in with no mood/duration: verify these stay unknown. Then record selected mood, energy and actual minutes and inspect history.
- Add a purpose/result only if useful; confirm unfiled captures remain valid. Mark a plan done; verify it remains in History and does not fabricate actual time.
- Add/resize the widget. Test all four actions. Capture from the home widget should reveal the real launcher behind its sheet. Close and reopen a draft.
- Check text entry, keyboard dictation if available, back-to-hide-keyboard, close button, keyboard navigation and TalkBack focus labels. Try large font/display zoom and landscape. Controls should remain reachable by scrolling.
- Save a Remind entry. Deny notification permission: entry survives, and no scheduled reminder is claimed. Grant permission, choose/confirm a future time, then check actual delivery.
- Set two reminders; change/cancel one without changing the other. Reboot before a future time and verify rescheduling. Force-stop is expected to interfere; reopen and inspect status. Check Samsung power saving and DND without claiming precise delivery.
- Export JSON to a chosen folder. Inspect entries, projects and revisions. The first version exports but does not import.
- Return after several days. There should be no streak penalty, catch-up requirement, fabricated activity or compulsory review.

## Scheduling references

Implementation uses Android's [inexact alarm guidance](https://developer.android.com/develop/background-work/services/alarms) and [notification permission behavior](https://developer.android.com/develop/ui/views/notifications/notification-permission). Notification posting is not a guarantee of exact or visible delivery. Ringing alarms use Android alarm-clock scheduling, media-playback foreground service and time-sensitive notifications. Calendar integration remains deferred.

## Screenshots

- [Widget Capture over launcher](testing/11-widget-capture.png)
- [Cloud connection](testing/07-cloud-sync.png)
- [Ringing alarm notification](testing/10-alarm-ringing.png)
- [Delivered notification after reboot](testing/15-reminder-delivered.png)
- [Larger font](testing/13-large-font.png)
- [Landscape](testing/14-landscape.png)

## Limits still requiring real-phone verification

Galaxy/One UI installation, audible alarm volume, locked-screen full-screen presentation, Samsung power saving, keyboard dictation, and TalkBack interaction have not been verified on physical hardware. Ten-minute timeout and simultaneous ringing alarms are implemented but have not had full wall-clock/device acceptance tests. Sync uploads automatically but does not restore a new phone or apply cloud edits. Production data will begin arriving only after your phone is paired.

Final APK SHA-256: `63a0ca4ef720658ce549a250b2e6441ec2db4e9240522a5bb67b1e3e91651765`.

## Capture and diagnostic logging — 2026-09-27

The combined `0.19-glass-diagnostics` APK and deployed diagnostic backend are verified in [diagnostic-logging-verification-2026-09-27.md](diagnostic-logging-verification-2026-09-27.md). The original Capture design matrix remains in [capture-glass-verification-2026-09-27.md](capture-glass-verification-2026-09-27.md). Query and activation instructions are in [diagnostic-logging.md](diagnostic-logging.md). Live checks use synthetic content and an explicitly identified emulator; the physical phone is not installed by these checks.

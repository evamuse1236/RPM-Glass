# RPM · personal Android app

Latest Android planning update: [v0.12 Clarity and Glass](docs/clarity-glass-verification-2026-09-16.md), with the installable APK at `releases/rpm-0.12-clarity-glass.apk`. Clarity improves the planner's agenda, appearance and controls; optional Glass capture saves original words first and requires review before changing plans. Enable it in Settings → Thought capture. The older prototype descriptions below are retained for historical context.

## Delivering updates

Dara's standing release instruction (2026-09-12): whenever an RPM update is built, send its final installable APK to the **Noted** WhatsApp group. Finish the relevant checks first, preserve the versioned artifact in `releases/`, resolve the exact group through the WhatsApp connector, and send the APK as a document with a short version/change caption. Do not send intermediate build iterations or test APKs. Use one stable request ID per release send; after an uncertain response, check that ID rather than creating a duplicate. Report submitted/delivery status accurately. This is part of the release workflow, not a recurring scheduled task.

**Earlier desktop exploration: a conversational local assistant.** Run `npm run chat -- --key-file /path/to/private/openrouter.env`, then open [localhost:4318](http://127.0.0.1:4318). A compact floating panel uses `openai/gpt-5.6-luna` through OpenRouter with tools for multi-plan edits, searchable history, explicit memory and Undo. First start imports a private persistent copy of CLI history; it never writes back or runs real alerts. No mic is included. See the [companion guide](chat-prototype/README.md).

The [CLI](cli/README.md) remains available with `npm run cli`. Android development resumed and reached v0.10; the desktop exploration remains available alongside it. The sections below include earlier Android milestones.


A small personal app for capturing next steps and checking in about real activity, without a required planning hierarchy.

**[Read the approved product/design brief](docs/product-context.md)** · [Approved widget](docs/design/approved-home-widget.png) · [Approved Capture states](docs/design/approved-capture-states.png)

## Redesign in version 0.4

- Compact Next / History / Results navigation and full-page entry/result editors.
- A smaller 4×1 home-screen widget with four direct actions.
- Duration, Purpose, Mood and Energy controls stay in the composer. Follow-up questions, typed replies, corrections and reminder confirmations appear inline rather than in pop-up dialogs. Android permissions and date/time pickers remain native.
- Light/dark tokens, scalable controls, and a keyboard-aware composer.

Reusable design pack: `/home/darax/.codex/skills/mobile-product-design/SKILL.md`. See [redesign plan](docs/design/redesign/plan.md) and [verification](docs/design/redesign/verification.md).

## Included in version 0.4

- Capture text and save it locally in SQLite. Original input and revision snapshots remain available after edits.
- Optional purpose, estimated duration and planned time. A small local English parser recognizes today/tomorrow or ISO dates with explicit clock times; unsupported text is preserved.
- Default duration: **30-minute estimate**, visibly unaccepted until chosen. This is never measured time.
- “Actually, twenty” proposes a duration correction to the visible latest entry in that capture session. Confirmation is required; “Save as new” is also available.
- Check in with automatic timestamp, optional mood, energy and reported actual minutes. Missing logs are not treated as inactivity.
- Next actions, recent history, optional result/purpose/life-area context and linked actions. Marking a plan done does not create actual time or mood data.
- A four-action home widget: Check in, Capture, Remind, Open app.
- Local **notification reminders and ringing alarms**, with explicit time confirmation and permission handling. Ringing alarms have Snooze (10 minutes), Dismiss, and a 10-minute auto-stop.
- **Automatic Convex uploads** after one-time pairing. Offline changes queue durably and retry when Android permits background work. Entries, check-ins, edits, results and revision history upload; incomplete drafts stay on the phone.
- JSON export through Android's document picker, including original input and revisions. Import is not included yet.

The app saves locally first and connects to your own Convex backend. It has no paid AI, custom recorder or TTS. Keyboard dictation is supplied by your keyboard; offline support depends on its speech engine and downloaded languages. Existing long-reflection/Drive workflows remain separate.

The previous `prototype-reimagined.html` is preserved for reference. Its former in-memory WebView is no longer the Android app. No prior durable prototype data was found to migrate. Application ID remains `com.rpm.prototype` to preserve project continuity; a differently signed installed prototype may require separate handling before an update can install.

## Build

Use JDK 17 and an Android SDK with platform 36 and Build Tools 36.0.0. Set `JAVA_HOME` and `ANDROID_HOME`, or put `sdk.dir=...` in a local `local.properties` file. Local tooling downloaded during development lives in ignored `.tooling/` and `/home/darax/.cache/rpm-android/sdk`.

```bash
./scripts/test-parser.sh
./scripts/build-debug.sh
```

The helper uses the downloaded local JDK if `JAVA_HOME` is unset. `build-debug.sh` assembles the debug app, runs Android lint, and builds the on-device integration-test APK. It does not itself run a device.

App output: `app/build/outputs/apk/debug/app-debug.apk`.
Test output: `app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`.

For a connected, authorized emulator or device:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w com.rpm.prototype.test/com.rpm.prototype.OfflineTests
```

The integration checks use their own disposable database. They do not clear personal entries. Test-only reminder IDs are separate from normal entries.

## Using it

1. Open RPM, choose Capture, type a thought, and Save. Close and reopen to find it in History.
2. Choose Check in to record a moment. Mood, energy, duration and purpose can remain empty.
3. Add the widget through **Settings → Home-screen widget**, or your launcher's Widgets menu.
4. Remind saves the thought first, then offers Notification reminder or Ringing alarm. Grant notification and alarm permissions when asked, return, and choose a time. **Settings → Alarms & reminders / Full-screen alarms** also opens the relevant settings. A time in ordinary Capture text does not automatically schedule an alert.
5. Open **Settings → Cloud sync**, leave the prefilled production URL, enter a fresh pairing code and tap **Connect & sync** once. Thereafter no cable is needed to collect saved data. See [phone setup](docs/phone-setup.md).
6. Use **Settings → Export data** before uninstalling or clearing app data. Exports contain personal information; choose a destination you trust. Automatic Android backup is intentionally disabled.

## Limits and verification

See [testing and device checklist](docs/testing.md) for actual checks, emulator evidence and remaining Samsung-specific work. Emulator screenshots use a stock Android profile matched to S24 FE resolution; they cannot verify Samsung One UI or keyboard behavior.

Notification reminders use `AlarmManager.setAndAllowWhileIdle`. Ringing alarms use `setAlarmClock` and require exact-alarm access. Full-screen alarm presentation depends on its separate permission; the notification still exposes controls. Android may defer delivery; notification permissions, channel settings, Do Not Disturb, power saving and force-stop affect what the user sees. Future reminders are rescheduled on reboot/app update/open. Overdue reminders after reboot are marked missed instead of generating a catch-up batch. “Posted” means handed to Android, not read or necessarily shown. Changing a planned action's time does not silently move an independently confirmed reminder.

Sync is upload-only: cloud records are available in your [production Convex dashboard](https://dashboard.convex.dev/t/vishwajit1236/rpm/neat-emu-821), but this build does not restore a phone or apply remote edits. Background uploads may be delayed by Android battery/network policies. The emulator uses a separate development deployment.

Cloud checks: `npm run test:cloud` and `npm run typecheck:cloud`. Deployment and data model notes are in [convex/README.md](convex/README.md).

Research and future AI/Drive/calendar ideas are preserved in the product brief, not implemented as hidden integrations. No recurring automation was created.

## Source and experiment homes

Android, CLI and chat source share this repository. Character experiments now live in `/home/darax/Codex Projects/Character Playground`; `prototypes` remains a compatibility symlink. APKs in `releases` and `output`, local settings and experiment captures stay outside Git. This local source baseline does not publish or release a new APK.

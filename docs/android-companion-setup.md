# RPM Butterfly · Android 0.5

This is a debug-signed, installable personal beta, not a Play Store release. Android 8+; current verification uses an Android 16 emulator, not a physical Samsung phone. If Android reports a signature conflict with an older RPM build, do not uninstall it without exporting/backing up its data first.

## On your phone

1. Open the APK and allow installation from the app you used to open it, if Android asks. Keep any existing RPM installation/data: install as an update rather than uninstalling.
2. Open RPM → Settings → Connect AI key. Enter your OpenRouter API key. The phone stores it encrypted with Android Keystore; the APK has no key. Chat uses `openai/gpt-5.6-luna` and sends relevant chat/context to OpenRouter. Internet is needed for AI, not to read saved plans or deliver scheduled alerts.
3. In Settings, allow floating over other apps, return to RPM and tap **Show floating butterfly**. Tap the butterfly to chat; drag it to move; long press or use its notification to hide. It does not automatically restart at boot.
4. Allow notifications. For ringing alarms, also allow exact alarms and, if desired, the full-screen alarm view. Check your alarm volume and RPM's battery restrictions. Create a short test reminder/alarm on the actual phone before relying on it.

The compact panel is 330 × 420 dp maximum, with a larger view available. It moves above the keyboard. Current suggestion and clarification bubbles sit directly above the input and scroll horizontally when needed.

## Bring your context from the desktop

Choose **Settings → Import context copy** and select a companion schema-2 JSON export. The running desktop companion's private file is `/home/darax/.local/share/rpm-companion/data.json`; transfer a copy privately, not the original CLI database. The APK deliberately contains no personal history.

Import replaces the phone companion copy after saving a private, recoverable pre-import backup. **Imported alerts are disarmed**, including after a time edit, until you tap **Enable on phone** for that entry in Plans. Settings can export the current copy or restore a pre-import backup. Treat exports as personal data.

The phone companion is separate from the earlier Android screens and Convex outbox. Those screens remain accessible through Settings. There is no automatic desktop/phone synchronization.

## What phone alerts mean

- Reminders are RPM Android notifications and can be delayed by Android.
- Ringing alarms use Android AlarmManager at the saved plan time, with alarm audio, 10-minute snooze, dismiss and a 10-minute automatic stop. They are **not** records in Samsung Clock, Google Calendar or another reminders app.
- Daily, weekly and weekday recurrence are supported. Cards show Android's next scheduled occurrence and permission/delivery state. Timezone travel and OEM-specific battery behavior need physical-device testing.
- Pending questions change nothing until the whole proposal resolves. Saving/editing/archiving/Undo reconcile the phone schedule. Imported history does not arm alarms by itself.
- Reopen RPM after force-stopping it or changing permissions. Android can cancel alarms when an app is force-stopped, exact-alarm permission is revoked, or the app is removed.

## Artwork

Original transparent PNGs generated through built-in Imagegen: `android-companion/assets/butterfly.png` and `garden.png`. Exact final prompts are in the adjacent `.prompt.md` files and embedded in PNG metadata. No wallpaper change or microphone permission is included.

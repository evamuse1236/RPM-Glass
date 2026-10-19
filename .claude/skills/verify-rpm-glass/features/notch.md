# Notch

The notch is a black island around the front camera, drawn by the `RPM Notch` accessibility service over every app. Collapsed it is a pill with the current task's time; tapped it opens into the island (task, bar, Done, Snooze, Log meal or Open plan, two small rows). A reminder or a ringing alarm turns it into an alert island. The playground (`npm run playground`, Notch screen) is its HTML copy.

## Sub-features

- `notch-pill` shows the current or next task's time (or water, routine) beside the camera.
- `notch-open` opens the island on tap, swipe right or pull down; swipe up or a tap outside closes it.
- `notch-long-press` opens the task's sheet in the planner.
- `notch-glass` when water is due and no task is planned, the island's first control is `Glass`; otherwise the due water row logs a glass. It saves in place (the planner stays closed) and the island turns into a receipt: a ring that fills one step, `Glass logged`, `N of G today` and `Undo` for 5 s.
- `notch-done` the island's `Done` ticks the task in place, a repeating task only at the occurrence shown, with the same receipt and Undo.
- `notch-alert-rows` the next reminder or alarm still to come today shows as a chip (icon and time) on the hero or its row, else as its own row. Tapping it opens the alert's controls: `Turn off`, `Alarm` or `Reminder`, `Done`, `Open`; each change shows a receipt with Undo.
- `notch-snooze` swipe left snoozes due water and routine nudges and shows `+Nm` on the pill for 2 s.
- `notch-reminder` shows a bell, the task, `Reminder · <time>` and `Done`, `Snooze 10 min`, `Open` for 6 s when a reminder fires, then the pill shows its time.
- `notch-alarm` shows a pulsing clock, `Ringing · <time>`, Snooze, Done and Stop until one is pressed. Done stops the ring and ticks the task; its Undo brings the task back and the ring stays stopped.

## How to get to it (user POV)

- Settings, `Notch` row on, then allow `RPM Notch` in Android's accessibility settings.
- Set a task's alert to `Reminder` or `Ringing alarm` and wait for its time.

## Driving it with rpmctl

Preconditions, all on the owned emulator only (`adb -s emulator-5580`):

- Give the emulator a centred camera hole: `adb -s emulator-5580 shell cmd overlay enable com.android.internal.display.cutout.emulation.emu01`. It reports a 122 × 132 px cutout at the top centre, so the pill is wider than on the S24 FE.
- Turn the service on: `adb -s emulator-5580 shell settings put secure enabled_accessibility_services com.rpm.prototype/com.rpm.prototype.NotchAccessibilityService`, then `settings put secure accessibility_enabled 1`.
- `rpmctl seed` wipes the app's data and the accessibility setting. Seed first, then turn the service and the Settings `Notch` row on.
- Early on a Monday the planner opens on the weekly review. Tap `Close review` before `More options`.

Steps:

- **Pill.** In the planner run `rpmctl tap --name "More options"`, `rpmctl tap --name "Settings"`, `rpmctl tap --name "Notch"`, then `rpmctl key home`. `rpmctl logs` shows `RpmNotch: notch.setting on` and one `island TASK <value>` line.
- **Open and close.** `adb -s emulator-5580 shell input tap <x> 69` on the pill logs `notch.gesture tap {"on":"PILL"}` and `island expanded`. `input swipe 540 700 540 350 150` logs `notch.gesture up {"on":"OPEN"}`. `input swipe 500 69 820 80 150` opens it as a swipe right.
- **Glass.** Load a store with no planned task and the last glass over 90 min ago (`.verify/evidence/island-water/make-water-due-store.mjs` builds one from a pulled `files/companion.json`), seed it, open the pill and tap `Glass`. The log shows `notch.runner.save saved {"ms":...}` and `notch.drink saved`, `dumpsys activity activities` still shows the launcher resumed, and `planner.body.water.glasses` grows by one. Tap `Undo` within 5 s: `notch.undo ok` and the glass is gone. Set `settings put global animator_duration_scale 5` to catch the ring mid-fill with `screencap`; set it back to 1 after.
- **Done and alert controls.** Seed a store with a weekly task started a few minutes ago and later tasks with `alertIntent` `reminder` and `alarm`. Open the island: the chips and the alert row show. `Done` adds the occurrence to `completedOccurrences`. Tap an alert row, then `Alarm` or `Turn off`: `state` shows the new `alertIntent.type` and `dumpsys alarm | grep -A3 rpm` shows the schedule change (an alarm is `window=0`, a reminder has a window).
- **Long press.** `input swipe <x> 69 <x> 69 900` logs `notch.open_task opened {"taskId":N}` and the planner shows the task sheet.
- **No idle redraws.** Clear the log, open and leave Settings, pull the shade down and up, then wait 15 s. `logcat -s RpmNotch` must show no new `island` lines.
- **Alerts.** Load a store whose task has `alertIntent: {type: "reminder"}` (or `"alarm"`) and `planned` a few minutes ahead (`rpmctl seed --file`), grant exact alarms with `adb -s emulator-5580 shell appops set com.rpm.prototype SCHEDULE_EXACT_ALARM allow`, and open the planner once so the alerts are scheduled. At the time the log shows `notch.reminder shown` or `notch.alarm shown`. Snooze logs `notch.alarm_snooze ok` and the delivery ledger (`shared_prefs/companion-delivery.xml`) shows `snoozed`. Done logs `notch.reminder_done ok` or `notch.alarm_done ok`, then `notch.alert_done saved`, and the task is done in `state`.

## Gotchas

- `rpmctl shot`, `ui`, `tap` and `open` run uiautomator, which unbinds every accessibility service for a moment. The notch then reconnects (`notch.service connected`) and comes back collapsed; a reminder island does not come back, a ringing alarm does. Take mid-state screenshots with `adb -s emulator-5580 shell screencap -p` and `adb pull`.
- The Settings `Notch` row opens Android's accessibility settings. Left on top, it makes the next `rpmctl seed` time out waiting for the app; run `adb shell am force-stop com.android.settings` before seeding. Turn the service on last, after any `rpmctl tap`.
- The first in-place save after the island opens takes about 2 s while the hidden page starts; later ones take 0.3 to 1 s on the emulator.
- Android may deliver a reminder minutes late; an alarm is exact.
- The emulator is not One UI and its cutout is not the S24 FE's camera. Samsung behavior, the real cutout and the alarm sound are **UNVERIFIED** here.

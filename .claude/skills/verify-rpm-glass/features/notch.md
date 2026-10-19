# Notch

The notch is a black island around the front camera, drawn by the `RPM Notch` accessibility service over every app. Collapsed it is a pill with the current task's time; tapped it opens into the island (task, bar, Done, Snooze, Log meal or Open plan, two small rows). A reminder or a ringing alarm turns it into an alert island. The playground (`npm run playground`, Notch screen) is its HTML copy.

## Sub-features

- `notch-pill` shows the current or next task's time (or water, routine) beside the camera.
- `notch-open` opens the island on tap, swipe right or pull down; swipe up or a tap outside closes it.
- `notch-long-press` opens the task's sheet in the planner.
- `notch-glass` when water is due and no task is planned, the island's first control is `Glass`; it opens the planner, which logs one glass with Undo.
- `notch-snooze` swipe left snoozes due water and routine nudges and shows `+Nm` on the pill for 2 s.
- `notch-reminder` shows a bell, the task and `Open ›` for 6 s when a reminder fires, then the pill shows its time.
- `notch-alarm` shows a pulsing clock, `Ringing · <time>`, Snooze and Stop until one is pressed.

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
- **Glass.** Load a store with no planned task and the last glass over 90 min ago (`.verify/evidence/island-water/make-water-due-store.mjs` builds one from a pulled `files/companion.json`), seed it, open the pill and tap `Glass`. The log shows `notch.drink opened` and `planner.body.water.glasses` grows by one.
- **Long press.** `input swipe <x> 69 <x> 69 900` logs `notch.open_task opened {"taskId":N}` and the planner shows the task sheet.
- **No idle redraws.** Clear the log, open and leave Settings, pull the shade down and up, then wait 15 s. `logcat -s RpmNotch` must show no new `island` lines.
- **Alerts.** Load a store whose task has `alertIntent: {type: "reminder"}` (or `"alarm"`) and `planned` a few minutes ahead (`rpmctl seed --file`), grant exact alarms with `adb -s emulator-5580 shell appops set com.rpm.prototype SCHEDULE_EXACT_ALARM allow`, and open the planner once so the alerts are scheduled. At the time the log shows `notch.reminder shown` or `notch.alarm shown`. Snooze logs `notch.alarm_snooze ok` and the delivery ledger (`shared_prefs/companion-delivery.xml`) shows `snoozed`.

## Gotchas

- `rpmctl shot`, `ui`, `tap` and `open` run uiautomator, which unbinds every accessibility service for a moment. The notch then reconnects (`notch.service connected`) and comes back collapsed; a reminder island does not come back, a ringing alarm does. Take mid-state screenshots with `adb -s emulator-5580 shell screencap -p` and `adb pull`.
- Android may deliver a reminder minutes late; an alarm is exact.
- The emulator is not One UI and its cutout is not the S24 FE's camera. Samsung behavior, the real cutout and the alarm sound are **UNVERIFIED** here.

# Notch

The notch is a black island around the front camera, drawn by the `RPM Notch` accessibility service over every app. Collapsed it is two drops in one pill: before the camera the current or next task's tone capsule and icon, after it the habit due now (water's segmented meter first, else the due meal's bowl). A tap on the task drop opens the task island: the ring grows out of the drop into the band beside the camera, with the task's title and line under it, Done, and up to three rows. A tap on the habit drop opens the habit island: a 72dp meter under the camera, its line, then Glass or Log meal and Later. Every island has one 36dp corner and a 16dp margin on all four sides. A reminder or a ringing alarm turns it into an alert island. The playground (`npm run playground`, Notch screen) is its HTML copy.

## Sub-features

- `notch-pill` shows the two drops: the task drop and the habit drop (water, then the due meal). With one, the other side hugs the camera; with neither, no notch shows.
- `notch-open` a tap or pull down on a drop opens that drop's island; swipe up or a tap outside closes it.
- `notch-long-press` on the task drop opens the task's sheet in the planner (in the task island, a tap on the title and line does the same); on the habit drop it opens water's sheet or the meal log.
- `notch-habit` the habit island shows the meter, `3 of 8 glasses` or `Dinner not logged`, then `Glass` or `Log meal` and `Later`. `Later` holds only that habit for the snooze time; `Log meal` opens the planner's meal log.
- `notch-glass` the habit island's `Glass` (or the task island's due water row) logs a glass in place (the planner stays closed). From the habit island the same meter shows the receipt: the new segment draws, the water tips like a glass set down, `Glass logged` over `N of G today`, and `Undo` under it for 5 s. From the water row the band's ring fills one step.
- `notch-done` the island's `Done` ticks the task in place, a repeating task only at the occurrence shown, with the same receipt and Undo.
- `notch-alert-rows` the next reminder or alarm still to come today shows as the hero's own alert row, as a chip and a Done circle on its task row, or else as its own row. Tapping it opens the alert's controls: `Turn off` as the primary, then rows `Make it a ringing alarm` or `Make it a reminder`, `Done`, `Open`; each change shows a receipt with Undo.
- `notch-snooze` swipe up (12dp), left or right on the pill means `Later` for the shown water or meal nudge, without logging it.
- `notch-reminder` shows a bell in the band, its time in the band, the task and `Reminder` (tap them to open the task), then two equal pills `Done` and `Snooze 10 min`, for 6 s when a reminder fires; then the pill shows its time.
- `notch-alarm` shows a pulsing clock and the time in the band, `Ringing`, then `Stop` across the width over `Snooze 10 min` and `Done`, until one is pressed. Done stops the ring and ticks the task; its Undo brings the task back and the ring stays stopped.

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

- **Pill.** In the planner run `rpmctl tap --name "More options"`, `rpmctl tap --name "Settings"`, `rpmctl tap --name "Notch"`, then `rpmctl key home`. `rpmctl logs` shows `RpmNotch: notch.setting on` and one `island drops task=<id> habit=<WATER|MEAL|->` line.
- **Open and close.** `adb -s emulator-5580 shell input tap <x> 69` on the task drop logs `notch.gesture tap {"on":"PILL","drop":"TASK"}` and `island expanded`; on the habit drop it logs `"drop":"HABIT"` and `island habit WATER 3 of 8 glasses`. `input swipe 540 700 540 350 150` logs `notch.gesture up {"on":"OPEN"}`. A tap that drifts, `input swipe <x> 69 <x> 41 250` (10dp up), still logs `notch.gesture tap {"on":"PILL"...}` and opens.
- **Later.** With only water due, take `rpmctl shot` before and after `adb -s emulator-5580 shell input swipe <drop-x> 110 <drop-x> 31 400` (28dp up at density 450). The drop hides, `state shared_prefs/notch.xml` has `snooze:water`, and the glass count stays unchanged. With only a meal due the saved key is `snooze:meal:<slot>`; left and right swipes also mean Later.
- **Glass.** Load a store with no planned task and the last glass over 90 min ago (`.verify/evidence/island-water/make-water-due-store.mjs` builds one from a pulled `files/companion.json`), seed it, tap the habit drop and tap `Glass` (or open the task island and tap the water row). The log shows `notch.runner.save saved {"ms":...}` and `notch.drink saved`, `dumpsys activity activities` still shows the launcher resumed, and `planner.body.water.glasses` grows by one. Tap `Undo` within 5 s: `notch.undo ok` and the glass is gone. Set `settings put global animator_duration_scale 5` to catch the meter tipping (or the ring mid-fill) with `screencap`; set it back to 1 after. Read the count back with `adb exec-out run-as com.rpm.prototype cat files/companion.json`: the live list is the last `glasses` in `planner`; an earlier one is an Undo copy.
- **Done and alert controls.** Seed a store with a weekly task started a few minutes ago and later tasks with `alertIntent` `reminder` and `alarm`. Open the island: the chips and the alert row show. `Done` adds the occurrence to `completedOccurrences`. Tap an alert row, then `Make it a ringing alarm` or `Turn off`: `state` shows the new `alertIntent.type` and `dumpsys alarm | grep -A3 rpm` shows the schedule change (an alarm is `window=0`, a reminder has a window).
- **Long press.** `input swipe <x> 69 <x> 69 900` on the task drop logs `notch.open_task opened {"taskId":N}` and the planner shows the task sheet; on the habit drop it logs `notch.open_water opened` or `notch.log_meal opened`.
- **Habit island.** With water not due and a meal slot started and not logged, the habit drop shows the bowl. Its island's `Log meal` logs `notch.log_meal opened {"slot":...}` and the planner opens `Log a meal` with that meal pressed.
- **Geometry.** Screenshot the open island, the alert row's controls, a receipt and both alert islands with `screencap` at normal text (`rpmctl display phone`). The band's circle sits 16dp in from the top and the start, and the last pill or row ends 16dp above the bottom. Check larger text only when the user requests it.
- **No idle redraws.** Clear the log, open and leave Settings, pull the shade down and up, then wait 15 s. `logcat -s RpmNotch` must show no new `island` lines.
- **Alerts.** Load a store whose task has `alertIntent: {type: "reminder"}` (or `"alarm"`) and `planned` a few minutes ahead (`rpmctl seed --file`), grant exact alarms with `adb -s emulator-5580 shell appops set com.rpm.prototype SCHEDULE_EXACT_ALARM allow`, and open the planner once so the alerts are scheduled. At the time the log shows `notch.reminder shown` or `notch.alarm shown`. Snooze logs `notch.alarm_snooze ok` and the delivery ledger (`shared_prefs/companion-delivery.xml`) shows `snoozed`. Done logs `notch.reminder_done ok` or `notch.alarm_done ok`, then `notch.alert_done saved`, and the task is done in `state`.

## Gotchas

- Any UI-automation runner hides the notch: `rpmctl shot`, `ui`, `tap`, `open` and T3's device panel all unbind accessibility services. The notch reconnects collapsed (`notch.service connected`); a reminder island does not come back, a ringing alarm does.
- Prove a gesture with `adb shell input` and `screencap -p`. Then check the gesture's log line (`notch.gesture <result>`) and the saved state.
- The Settings `Notch` row opens Android's accessibility settings. Left on top, it makes the next `rpmctl seed` time out waiting for the app; run `adb shell am force-stop com.android.settings` before seeding. Turn the service on last, after any `rpmctl tap`.
- The first in-place save after the island opens takes about 2 s while the hidden page starts; later ones take 0.3 to 1 s on the emulator.
- Android may deliver a reminder minutes late; an alarm is exact.
- On the current emulator image `emu01` reports a 556 × 171 px notch, so the drops sit far apart; the S24 FE's hole is small. Toggling the overlay can report no cutout for a few seconds.
- The emulator is not One UI and its cutout is not the S24 FE's camera. Samsung behavior, the real cutout and the alarm sound are **UNVERIFIED** here.

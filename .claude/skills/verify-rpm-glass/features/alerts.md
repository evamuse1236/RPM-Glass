# Alerts

Alerts are reminders and ringing alarms attached to a task with a time. A reminder posts a notification at the time. A ringing alarm plays a sound and vibrates, shows a full-screen `Time for your plan` page, and can be snoozed for ten minutes or dismissed. The user sets the alert on the task, grants notification and exact-alarm permission in Settings, and sees a delivery status.

## Sub-features

- `alert-set` sets `No alert`, `Reminder` or `Ringing alarm` on a task that has a time.
- `alert-status` shows a delivery status such as `Reminder scheduled · <day, time> · may be delayed`.
- `alert-permissions` shows `Notifications`, `Exact alarms` and `Lock-screen alarms` as `Allowed` or `Permission needed`.
- `alert-check` reschedules saved alerts with `Check saved alerts`.
- `alert-reminder-fire` posts a reminder notification at the time.
- `alert-alarm-fire` rings the alarm with a full-screen page, Snooze and Dismiss.
- `alert-sound-preview` previews the alarm sound for five seconds.
- `alert-capture` offers alerts from Capture (model-backed, UNVERIFIED) and shows delivery lines on a receipt.

## How to get to it (user POV)

- In the task sheet, tap the `Alert` field and choose a chip.
- In quick add, set a day and time, then choose an alert.
- In Settings, open `Sounds & alerts`.
- Wait for the time, then use the notification or the full-screen page.
- Say a reminder in Capture (needs the AI key).

## Driving it with rpmctl

Preconditions:

- Baseline state. Notification permission is granted at install (`-g`). The exact-alarm permission is (unconfirmed) on the emulator; read the Settings row.
- A task with a time, for example `Group call: merge sections` (4:00 PM today), open in the task sheet.

- **Permission rows.** Open Settings (`More options` then `Settings`). Under `Sounds & alerts`, run `rpmctl ui`. The rows `Notifications` and `Exact alarms` carry the value `Allowed` or `Permission needed`. Run `rpmctl shot alerts-permissions`.
- **Choose a reminder.** Run `rpmctl tap --role button --name "Group call: merge sections"`, then `rpmctl tap --name "Alert"`. Chips named `No alert`, `Reminder`, `Ringing alarm` unfold with the current one marked. Run `rpmctl tap --role button --name "Reminder"`. A snackbar reads `Reminder set` or similar (unconfirmed). `rpmctl state files/companion.json` shows the entry with an alert of type reminder.
- **Choose an alarm.** Run `rpmctl tap --role button --name "Ringing alarm"`. The snackbar reads `Alarm set` or similar. The file shows the alert type alarm.
- **Turn off.** Run `rpmctl tap --role button --name "No alert"`. The snackbar reads `Alert off`.
- **No time.** A task with no time has no alert row, or the alert cannot be scheduled. The status would read `Not scheduled · add a time`.
- **Delivery status.** Possible states are `Reminder scheduled · Wed, 4:00 PM · may be delayed`, `Alarm scheduled · Wed, 4:00 PM`, `Not scheduled · allow notifications`, `Not scheduled · allow notifications and exact alarms`, `Not scheduled · add a time`, `Time passed · not scheduled` and `Alert off`. Where the planner shows this line is (unconfirmed). Look in the task sheet's Alert field and on a Capture receipt (`Check alert delivery in Planner.`). Run `rpmctl shot alerts-status`.
- **Check saved alerts.** In Settings run `rpmctl tap --name "Check saved alerts"`. The status line reads `Saved alert schedules checked.`
- **Fire a reminder.** Set the task time one or two minutes ahead through the task sheet's `Time` chips (a custom time may need `rpmctl tap --native` on a time picker; unconfirmed), set `Reminder`, and wait. Then run `rpmctl key home` and check `rpmctl ui --native` for a notification titled with the task name and the text `Your RPM reminder`. Android may delay it, so allow time. This is a long recipe; mark **UNVERIFIED** if the time cannot be set.
- **Fire an alarm.** Same, with `Ringing alarm`. At the time, a full-screen page appears headed `Time for your plan` with the task title and buttons `Snooze · 10 minutes` and `Dismiss`. Run `rpmctl ui --native` and `rpmctl shot alarm-ringing`. A notification says `It's time · Snooze for 10 minutes or dismiss`.
- **Dismiss.** Run `rpmctl tap --native "Dismiss"`. The page closes and the alert status reads `Alarm dismissed`. `Snooze · 10 minutes` instead reschedules ten minutes later (the status shows the snooze).
- **Audible sound.** Cannot be heard on the `-no-audio` emulator. The ringing sound and vibration are **UNVERIFIED**. The Settings `Preview alarm sound` only reports that it is playing.
- **Sound preview.** In Settings run `rpmctl tap --name "Preview alarm sound"`. The status reads `Playing the alarm sound for 5 seconds.` and the row reads `Stop alarm preview`. See the Settings file.
- **Recurring alerts.** A task with Repeat set and an alert schedules the next occurrence after each firing, and the status shows `next <time>`. **UNVERIFIED** without waiting for a firing.
- **Large text.** Run `rpmctl display large-text`, open the task sheet's Alert field and Settings `Sounds & alerts`, `rpmctl shot alerts-large-text`, then `rpmctl display phone`. Status lines must wrap, not clip.
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- Android may delay reminders; a reminder that arrives a few minutes late is not a failure. An alarm is exact.
- The exact-alarm and lock-screen permissions are separate from notifications. All three can differ.
- Alerts for a recurring task or an imported task can be disarmed on import (`Imported · not armed on this phone`).
- Firing needs the clock to reach the task's time. `rpmctl` cannot move the emulator clock, so a firing recipe takes real minutes.
- The reminder notification text is fixed and does not repeat the task body. The title is the task title.
- Sound, vibration and the lock-screen path are **UNVERIFIED** on the emulator.
- Reseed after changing alerts.

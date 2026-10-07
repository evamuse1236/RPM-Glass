# Settings

Settings is a planner screen with grouped rows for alarm and reminder sounds, notification permissions, widget text size, the floating butterfly, the AI key, backups, diagnostics, theme and About. Rows that need Android hand off to native dialogs or system screens, then report the result in a status line.

## Sub-features

- `settings-open` opens the screen from the planner menu or the Capture menu.
- `settings-sounds` shows alarm sound, preview, reminder sound, notifications, exact alarms, lock-screen alarms and `Check saved alerts`.
- `settings-widget-text` sets the widget text size from 80 to 160 percent.
- `settings-butterfly` shows the butterfly permission row or switch (see the floating butterfly file).
- `settings-ai-key` connects, replaces or removes the AI key through native dialogs.
- `settings-backup` offers import, export and restore of context copies.
- `settings-earlier` opens the earlier native screens (see the earlier screens file).
- `settings-diagnostics` shows diagnostics status and the connect dialog.
- `settings-theme` chooses System default, Light or Dark.
- `settings-about` shows the About text and `Automation previews`.
- `settings-back` returns to the previous planner screen.

## How to get to it (user POV)

- In the planner, tap `More options` then `Settings`.
- In Capture, tap `More: planner, history, settings` then `Assistant settings` (opens a settings screen; which one is unconfirmed).
- In Capture, tap `Connect` in the keyless note (opens the AI key dialog directly).
- In a keyless AI sheet, tap `Open Settings`.
- In the About page of Capture, tap `Phone settings`.

## Driving it with rpmctl

Preconditions:

- Baseline state. No AI key is connected.
- `rpmctl open planner` has been run, on Today.

- **Open.** Run `rpmctl tap --role button --name "More options"` then `rpmctl tap --role menuitem --name "Settings"`. The top bar shows `Back` and the title `Settings`. The bottom navigation is still present. Run `rpmctl shot settings-top`.
- **Groups.** Scrolling shows headings (level 2) `Appearance`, `Sounds & alerts`, `Widgets`, `Account & backup`, `Diagnostics`, `About`. Use `rpmctl scroll down` between shots.
- **Appearance.** A row named `Theme` with the value `System default`. Run `rpmctl tap --name "Theme"`. A dialog named `Theme` lists radios `System default`, `Light`, `Dark` and a `Cancel` button. Run `rpmctl tap --name "Dark"`. The app switches to dark colors at once and the row value reads `Dark`. Run `rpmctl shot settings-dark`. Set it back to `System default`.
- **Sounds rows.** Rows are buttons whose names join the label, the detail and the value, for example `Alarm sound Ringing alarms use alarm volume …`, `Preview alarm sound Plays for 5 seconds at alarm volume`, `Reminder sound Android notification channel`, `Notifications Required for reminders and ringing alarms …`, `Exact alarms Required for alarms at the chosen time …`, `Check saved alerts Retry scheduling after permission changes`, plus `Lock-screen alarms` when the phone supports it. A value of `Permission needed` or `Allowed` shows on the right.
- **Alarm sound.** Run `rpmctl tap --name "Alarm sound"`. The status line reads `Choose an alarm sound on your phone.` and a native dialog `Alarm sound` lists `Choose phone tone`, `Choose audio file`, `Use phone default`. Run `rpmctl ui --native`, then `rpmctl tap --native "Use phone default"`.
- **Preview.** Run `rpmctl tap --name "Preview alarm sound"`. The status line reads `Playing the alarm sound for 5 seconds.` and the row becomes `Stop alarm preview` with the value `Playing`. Audible output cannot be heard on the `-no-audio` emulator, so the sound is **UNVERIFIED**. Tap `Stop alarm preview` and the line reads `Alarm preview stopped.`
- **Notifications.** Run `rpmctl tap --name "Notifications"`. The status line reads `Opening Android notification controls.` and an Android settings screen opens. Run `rpmctl ui --native`, then `rpmctl key back` to return.
- **Exact alarms.** Run `rpmctl tap --name "Exact alarms"`. The status line reads `Opening Android exact alarm permission.` on Android 12 and later, and Android's screen opens. Return with `rpmctl key back`.
- **Check saved alerts.** Run `rpmctl tap --name "Check saved alerts"`. The status line reads `Saved alert schedules checked.`
- **Widget text size.** Under `Widgets` there is a slider named `Widget text size` (80 to 160 percent) and a preview text `A clear next action` named `Widget text size preview`. Moving the slider changes the number and the preview size, and on release saves and shows a status line such as `Widget text size set to 120%.` Drive it with `rpmctl tap --xy` on the slider track, or focus it and press `rpmctl key right`. Run `rpmctl shot settings-widget-text`. The home-screen widget itself is **UNVERIFIED**.
- **Butterfly row.** Under `Widgets`: `Allow floating butterfly` with `Permission needed`, or the switch `Floating butterfly`. See the floating butterfly file.
- **AI key (keyless).** Under `Account & backup`, a row `Connect AI key` with the value `Not connected` and the detail `OpenRouter · Luna chat + review-only Jev sorting`. Run `rpmctl tap --name "Connect AI key"`. The status line reads `Enter the key in the secure Android dialog.` and a native dialog `Connect OpenRouter` shows with `Cancel` and `Save key`. Run `rpmctl ui --native` and `rpmctl shot settings-key-dialog`, then `rpmctl tap --native "Cancel"`. Entering a key is not done here. With no real key, `Remove AI key` is absent. A connected key, and every model-backed feature, is **UNVERIFIED**.
- **Backup rows.** `Import context copy`, `Export context` and `Restore a backup` (value `None`). Tapping `Restore a backup` with none saved shows an empty native list or an error dialog (unconfirmed). `Import` shows a native dialog `Replace this companion's context?` with `Cancel` and `Choose file`. Cancel it. `Export` opens a system file picker; cancel with `rpmctl key back`.
- **Earlier screens.** The row `Earlier RPM screens` opens the older native screens (see that file).
- **Diagnostics.** The group shows a note and a row `Connect diagnostics` with `Not connected`. Tapping it opens a native dialog `Connect diagnostics` asking for a 32-character code. Cancel it. Pairing is **UNVERIFIED** (needs a code from the owner's database).
- **About.** The group shows `RPM · Result, Purpose, Plan`, `Capture saves your words and asks before adding tasks or blocks.` and a disclosure `Automation previews`.
- **Back.** Run `rpmctl tap --role button --name "Back"` or `rpmctl key back`. The previous screen returns. If the alarm preview is playing it stops.
- **Large text.** Run `rpmctl display large-text`, open Settings, `rpmctl shot settings-large-text`, then `rpmctl display max-text`, scroll through all groups with `rpmctl scroll down` and shoot each, then `rpmctl display phone`. Row labels, details and values must wrap without overlapping the switch or the value.
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- Row names are long and change with state (`Allowed` vs `Permission needed`). Match on the first words.
- While a native action is running, all rows are disabled for a moment. Wait for the status line instead of tapping again.
- System screens opened by `Notifications`, `Exact alarms` and `Reminder sound` leave the app. Return with `rpmctl key back`, then `rpmctl doctor` if the page looks stuck.
- The theme choice may survive `seed` (unconfirmed). Set it back to `System default`.
- Do not enter a fake key. It would flip the app to the connected state and send real requests.
- Reseed does not reset settings stored natively (sounds, widget text size). `rpmctl cleanup` ends the emulator and resets them because the emulator is read-only.

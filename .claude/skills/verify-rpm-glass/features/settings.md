# Settings

Settings is a short home list of grouped cards. Each row opens one page on the planner's stack, and the top bar shows that page's title with `Back`. Rows that need Android hand off to native dialogs or system screens, then report the result in a status line at the top of the page. Design: `docs/settings/redesign.md`.

## Sub-features

- `settings-open` opens the home list from the planner menu or the Capture menu.
- `settings-attention` shows a red row at the top of home only while something blocks alarms or the notch.
- `settings-appearance` sets the theme (System, Light, Dark segments) and tab bar transparency.
- `settings-notch` switches the notch and the floating butterfly (see the floating butterfly file) and sets widget text size.
- `settings-alerts` shows alarm sound, play, reminder sound, notifications, exact alarms and `Check saved alerts`.
- `settings-voice` connects the Gemini key and picks voice and persona.
- `settings-ai-keys` connects, replaces or removes the Claude and OpenRouter keys through native dialogs.
- `settings-sync` links a web browser and offers export, import and restore.
- `settings-diagnostics` shows diagnostics status, the connect dialog and recent captures.
- `settings-about` shows About, `Earlier RPM screens` and `Automation previews`.
- `settings-back` pops one page; from home it returns to the previous planner screen.

## How to get to it (user POV)

- In the planner, tap `More options` then `Settings`.
- In Capture, hold `Open planner` (`--long`) then tap `Settings`.
- In a keyless AI sheet, tap `Open Settings` (opens AI keys and its connect dialog).

## Driving it with rpmctl

Preconditions:

- After `rpmctl launch`, run `export RPMCTL_OWNER=<owner from launch>` in this agent's shell. Keep it set through cleanup.
- Baseline state: no AI key is connected. `rpmctl open planner` has been run, on Today.

Steps:

- **Open.** Run `rpmctl tap --role button --name "More options"` then `rpmctl tap --role menuitem --name "Settings"`. The top bar shows `Back` and `Settings`. Home fits on one phone screen: rows `Appearance`, `Notch & widgets`, `Alarms & reminders`, `Voice`, `AI keys`, `Sync & backup`, `Diagnostics`, `About`, each with a coloured icon tile and a chevron. Values on the right: Appearance `System`, Notch `Off`, Voice `Off` (no Gemini key), AI keys `None`, Diagnostics `Off`. Run `rpmctl shot settings-home`.
- **Attention.** On the emulator exact alarms are not allowed, so the `Alarms & reminders` row's value reads `1 off` (or `2 off`) in red; no banner sits above the cards. Tapping the row opens `Alarms & reminders`, where `Permissions` comes first.
- **Open a page.** Run `rpmctl tap --role button --name "Appearance"`. The title becomes `Appearance`. `rpmctl tap --role button --name "Back"` returns to the home list.
- **Theme.** On Appearance, a row `Theme` with three segments `System`, `Light`, `Dark`. The radio inputs are see-through, so tap by position: `rpmctl tap --css ".segment:nth-child(3)"` picks Dark. The app turns dark at once; `rpmctl eval "localStorage.getItem('rpm-clarity:appearance')"` reads `dark`, and the home row value reads `Dark`. Set it back with `.segment:nth-child(1)`.
- **Tab bar transparency.** Below Theme: slider `Tab bar transparency` (`20%`) over a sample of the tab bar. Drag it with `rpmctl scroll right --css "#bar-transparency" --amount 300`; it moves in 5% steps, and all the way left reads `Solid`.
- **Widget text size.** On `Notch & widgets`, under `Home screen widgets`: slider `Widget text size` (80 to 160 percent) with the preview `A clear next action`. On release it saves and the status line reads, for example, `Widget text size set to 120%.` The home-screen widget itself is **UNVERIFIED**.
- **Notch & widgets.** A switch `Notch` and the butterfly row (`Floating butterfly` with `Allow`, or its switch). With the notch on but Android not allowing it, rows `Allow RPM Notch` (red `Allow`) and `RPM Notch greyed out?` appear.
- **Alarms & reminders.** Group `Permissions` first: `Notifications` and `Exact alarms` each read `Allowed` or a tonal `Allow`; then `Check saved alerts`. Group `Sounds`: `Alarm sound` (value), `Play alarm sound`, `Reminder sound`. No description lines or footnote.
  - `rpmctl tap --name "Alarm sound"`: status `Choose an alarm sound on your phone.` and a native dialog with `Choose phone tone`, `Choose audio file`, `Use phone default` (`rpmctl ui --native`).
  - `rpmctl tap --name "Play alarm sound"`: status `Playing the alarm sound for 5 seconds.` and the row becomes `Stop alarm sound`. Sound is **UNVERIFIED** on the `-no-audio` emulator.
  - `Notifications` and `Exact alarms` open Android screens; return with `rpmctl key back`.
- **Voice.** `Gemini key` (`Not set` or `Connected`), then `Voice` and `Persona`. `Voice` opens the voice dialog; a tap on a voice saves it and plays its sample. With a key, a red `Remove Gemini key` sits in its own card at the end.
- **AI keys.** `Claude` and `OpenRouter`, each `Not set` or `Connected`. Tapping opens the native key dialog; cancel it. Remove rows show only for connected keys, in a separate card, in red.
- **Sync & backup.** `Link a web browser`, then a `Backup` group: `Export`, `Import`, `Restore a backup` (`None`). `Import` shows a native dialog `Replace this companion's context?`; cancel it. `Export` opens a system file picker; cancel with `rpmctl key back`.
- **Diagnostics.** Not connected: one row `Connect diagnostics` that opens a native dialog asking for a 32-character code; cancel it. Below, once a capture exists, a card `Recent captures (N)` that expands (tap with `--css ".settings-details summary"`). Pairing is **UNVERIFIED**.
- **About.** `RPM` with the tagline, `Earlier RPM screens` (see that file) and an expandable `Automation previews`.
- **Back.** `rpmctl key back` pops one page. If the alarm sound is playing it stops.
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- Row names join the label, detail and value (`Exact alarmsFor alarms at the chosen minuteAllow`). Match on the first words, and use `--role button` with a full page name, since `Voice` also matches other rows.
- `rpmctl ui` skips see-through elements, so the theme radios and the `<summary>` rows are not listed. Tap them with `--css`.
- While a native action runs, all rows are disabled for a moment. Wait for the status line before tapping again.

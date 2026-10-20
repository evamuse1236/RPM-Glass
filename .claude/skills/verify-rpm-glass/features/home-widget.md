# Home widget

RPM has two home-screen widgets. The first is a one-row capture bar. Its pill (`Capture a thought`) opens Capture ready to type, its mic opens Capture already listening, and its butterfly icon opens the planner. The second, `RPM next up` (2 × 2), shows the next task's tone capsule and a countdown ring, "in 50 min" and the title, then the water meter, a mic and a plus. Both follow the Settings widget text size.

## Sub-features

- `widget-pill` opens Capture ready to type.
- `widget-mic` opens Capture and starts voice input.
- `widget-planner` opens the planner from the widget icon.
- `widget-label` shows `Capture a thought`, or `Capture` when the widget is narrow.
- `widget-place` adds the widget to a home screen and resizes it horizontally.
- `widget-text-scale` follows the Settings widget text size.
- `next-up-task` tapping the task opens its task sheet in the planner (the day's plan for a calendar event or nothing timed).
- `next-up-water` tapping the meter opens the planner's Water sheet. It does not log in place: the widget has no surface for the receipt and Undo.
- `next-up-mic` and `next-up-plus` open Capture listening, or ready to type.
- `next-up-refresh` it redraws on every saved change and at each minute the countdown changes ("at 4:30 PM" needs no update until the last hour); its alarms never wake the phone.

## How to get to it (user POV)

- Long-press the home screen, choose Widgets, then add the RPM widget (5 cells wide, 1 cell high).
- Tap the pill `Capture a thought` on the placed widget.
- Tap the mic (`Speak a thought`) on the placed widget.
- Tap the butterfly icon (`Open planner`) on the placed widget.

## Driving it with rpmctl

Preconditions:

- After `rpmctl launch`, run `export RPMCTL_OWNER=<owner from launch>` in this agent's shell (PowerShell: `$env:RPMCTL_OWNER = '<owner from launch>'`). Keep it set through cleanup.

- Baseline state. The emulator's launcher is the stock one.
- `rpmctl open capture` works.

- **Pill.** Run `rpmctl open widget-capture`. This sends the same intent the pill sends. Capture comes to the front with the field `Capture a thought` focused. Run `rpmctl shot widget-capture`. If the planner was open with an unsaved sheet, that sheet is closed; saved data and the Capture draft stay.
- **Mic.** Run `rpmctl open widget-voice`. Capture opens and the card `Listening with Android voice input` shows, then Android's speech window opens (the emulator may not provide one; an error line under the field would then show, unconfirmed). Run `rpmctl shot widget-voice`, then `rpmctl key back`. Spoken text is **UNVERIFIED**.
- **Planner icon.** The planner is not exported, so no rpmctl command sends the widget's open intent. This path is **UNVERIFIED** on the emulator. State the attempted command (`rpmctl open planner` reaches the same screen by a different path) and do not report the icon as verified.
- **Placement and label.** Adding the widget from the launcher's widget picker, its preview, its description `Capture a thought by typing or speaking, or open your planner.`, horizontal resize and the narrow label `Capture` all need a real home screen. This is **UNVERIFIED** on the emulator. To try anyway: `rpmctl key home`, `rpmctl ui --native` to inspect the launcher, then long-press with `rpmctl tap --native "<text>" --long` (unconfirmed that the emulator's launcher offers the picker).
- **Widget text size.** Change `Widget text size` in Settings (see the Settings file) and compare the widget text. **UNVERIFIED** without a placed widget.
- **Errors.** Run `rpmctl logs --errors` after the intents.

### Next up

- **Place it.** `adb shell input keyevent KEYCODE_HOME`, long-press an empty spot (`input swipe 540 1500 540 1500 1200`), tap `Widgets`, search `RPM`, tap `RPM, RPM next up`, then drag its preview (`input draganddrop <x> <y> 540 1300 1500`). On the stock five-column launcher it lands two cells wide (about 132dp) and uses the compact layout.
- **Refresh.** `logcat -s RpmNextUp` shows `next up <state> until <time>` after each save and tick; `dumpsys alarm | grep -A3 next_up` shows one `RTC` (non-waking) alarm.
- **Taps.** Tap the title: `rpmctl ui --brief` shows `dialog "Task"` with that title. Tap the meter: `dialog "Water"`. Tap the mic: `Listening`. Tap the plus: `Capture a thought` focused.
- **Theme and text.** `cmd uimode night yes` swaps the art without a redraw. The Settings `Widget text size` slider (tap its centre for 120%) logs a new `next up` line and the text grows.

## Gotchas

- `open widget-capture` and `open widget-voice` prove only what the intent does inside the app. They do not prove the widget exists, shows the right label, or is tappable.
- The widget rebinds its buttons after the app updates. A stale widget on a real phone can keep old behavior until its next update.
- The mic needs the page loaded. The app waits briefly for data before starting voice.
- Back at the Capture sheet, `Close Capture` returns to the home screen, not to the planner.
- Report widget placement and the planner icon as **UNVERIFIED** unless a real home screen was driven.

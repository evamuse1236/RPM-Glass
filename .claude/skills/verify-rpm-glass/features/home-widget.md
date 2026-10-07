# Home widget

The home-screen widget is a one-row capture bar. Its pill (`Capture a thought`) opens Capture ready to type, its mic opens Capture already listening, and its butterfly icon opens the planner. The text size follows a Settings slider.

## Sub-features

- `widget-pill` opens Capture ready to type.
- `widget-mic` opens Capture and starts voice input.
- `widget-planner` opens the planner from the widget icon.
- `widget-label` shows `Capture a thought`, or `Capture` when the widget is narrow.
- `widget-place` adds the widget to a home screen and resizes it horizontally.
- `widget-text-scale` follows the Settings widget text size.

## How to get to it (user POV)

- Long-press the home screen, choose Widgets, then add the RPM widget (5 cells wide, 1 cell high).
- Tap the pill `Capture a thought` on the placed widget.
- Tap the mic (`Speak a thought`) on the placed widget.
- Tap the butterfly icon (`Open planner`) on the placed widget.

## Driving it with rpmctl

Preconditions:

- Baseline state. The emulator's launcher is the stock one.
- `rpmctl open capture` works.

- **Pill.** Run `rpmctl open widget-capture`. This sends the same intent the pill sends. Capture comes to the front with the field `Capture a thought` focused. Run `rpmctl shot widget-capture`. If the planner was open with an unsaved sheet, that sheet is closed; saved data and the Capture draft stay.
- **Mic.** Run `rpmctl open widget-voice`. Capture opens and the card `Listening with Android voice input` shows, then Android's speech window opens (the emulator may not provide one; an error line under the field would then show, unconfirmed). Run `rpmctl shot widget-voice`, then `rpmctl key back`. Spoken text is **UNVERIFIED**.
- **Planner icon.** The planner is not exported, so no rpmctl command sends the widget's open intent. This path is **UNVERIFIED** on the emulator. State the attempted command (`rpmctl open planner` reaches the same screen by a different path) and do not report the icon as verified.
- **Placement and label.** Adding the widget from the launcher's widget picker, its preview, its description `Capture a thought by typing or speaking, or open your planner.`, horizontal resize and the narrow label `Capture` all need a real home screen. This is **UNVERIFIED** on the emulator. To try anyway: `rpmctl key home`, `rpmctl ui --native` to inspect the launcher, then long-press with `rpmctl tap --native "<text>" --long` (unconfirmed that the emulator's launcher offers the picker).
- **Widget text size.** Change `Widget text size` in Settings (see the Settings file) and compare the widget text. **UNVERIFIED** without a placed widget.
- **Errors.** Run `rpmctl logs --errors` after the intents.

## Gotchas

- `open widget-capture` and `open widget-voice` prove only what the intent does inside the app. They do not prove the widget exists, shows the right label, or is tappable.
- The widget rebinds its buttons after the app updates. A stale widget on a real phone can keep old behavior until its next update.
- The mic needs the page loaded. The app waits briefly for data before starting voice.
- Back at the Capture sheet, `Close Capture` returns to the home screen, not to the planner.
- Report widget placement and the planner icon as **UNVERIFIED** unless a real home screen was driven.

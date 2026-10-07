# Floating butterfly

The floating butterfly is a small draggable butterfly shown over other apps. Tapping it opens RPM's Capture, dragging moves it, and a long press hides it. The user turns it on in Settings, and it needs Android's "display over other apps" permission. It hides itself while RPM is on screen and never starts on its own after boot.

## Sub-features

- `butterfly-permission` shows `Allow floating butterfly` with `Permission needed` until the overlay permission is granted.
- `butterfly-switch` shows the `Floating butterfly` switch once allowed, on or off.
- `butterfly-show` starts the butterfly and a quiet notification.
- `butterfly-open` opens Capture when the butterfly is tapped.
- `butterfly-move` drags the butterfly and remembers its place.
- `butterfly-hide` hides it by long press, by switch, or from the notification.
- `butterfly-hidden-in-app` keeps it hidden while RPM is visible.

## How to get to it (user POV)

- Open Settings, find the `Widgets` group, and tap `Allow floating butterfly` or switch `Floating butterfly` on.
- Leave RPM; the butterfly floats over the home screen and other apps.
- Tap the butterfly to open Capture; long-press it, or use the `Hide` action on the `RPM butterfly is available` notification, to hide it.

## Driving it with rpmctl

Preconditions:

- Baseline state, then `rpmctl open planner`, then Settings open (`More options` then `Settings`).
- The app is installed with runtime permissions granted, but the overlay permission is a separate app setting. Whether it is already granted on the emulator is (unconfirmed); `rpmctl ui` shows which row appears.

- **Not allowed.** If the `Widgets` group shows a button `Allow floating butterfly` with the value `Permission needed` and the detail `Open RPM over your other apps`, the permission is missing. Run `rpmctl shot butterfly-needs-permission`.
- **Grant.** Run `rpmctl tap --name "Allow floating butterfly"`. The status line reads `Opening Android floating-window permission.` and Android's screen for the RPM overlay permission opens. Run `rpmctl ui --native`, then turn on the allow switch with `rpmctl tap --native "Allow display over other apps"` (label is unconfirmed; use what `ui --native` shows). Return with `rpmctl key back`. The row then becomes a switch named `Floating butterfly` with the detail `Open Capture over your other apps`.
- **Switch on.** Run `rpmctl tap --role switch --name "Floating butterfly"`. The switch reads `aria-checked=true` and the status line reads `Butterfly started. Leave RPM to see it.` Without the permission the line reads `Allow the floating butterfly in Android Settings first.` Run `rpmctl shot butterfly-switch-on`.
- **Hidden in app.** While RPM is on screen, `rpmctl ui --native` does not list the butterfly (it is hidden on purpose).
- **See it.** Run `rpmctl key home`, then `rpmctl ui --native` and `rpmctl shot butterfly-over-home`. A view with the description `RPM butterfly. Tap to chat; drag to move; long press to hide.` is listed, and a quiet notification titled `RPM butterfly is available` with the text `Tap the butterfly to chat. You can hide it here.` is posted (check the notification shade through `rpmctl ui --native` after opening it with `rpmctl key` if available, unconfirmed).
- **Open Capture.** Run `rpmctl tap --native "RPM butterfly. Tap to chat; drag to move; long press to hide."`. The Capture sheet opens (the app's launcher screen) and the butterfly hides while RPM shows.
- **Move.** Dragging needs a swipe gesture that rpmctl lacks, so moving and remembering its position is **UNVERIFIED**.
- **Hide by long press.** Run `rpmctl tap --native "RPM butterfly. Tap to chat; drag to move; long press to hide." --long`. The butterfly disappears and the notification goes away. Reopen Settings; the switch reads `aria-checked=false` after it refreshes.
- **Hide by switch.** With the butterfly on, run `rpmctl tap --role switch --name "Floating butterfly"` again. The status line reads `Butterfly hidden.`
- **No restart on boot.** After `rpmctl cleanup` and a new `rpmctl launch`, the butterfly is off. It never turns itself on.
- **Large text.** Run `rpmctl display large-text`, `rpmctl shot butterfly-settings-large-text`, then `rpmctl display phone`. The row label and value must not clip.
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- The permission is an Android app setting, not a permission prompt. The `-g` install flag does not grant it. Whether the emulator already allows it is **unconfirmed**; read the row.
- The butterfly is hidden while RPM is visible. Seeing no butterfly inside the app is correct.
- The Settings row refreshes a moment after the service starts. Wait before reading the switch.
- A real phone (Samsung One UI) can differ in overlay behavior and battery limits. Those are **UNVERIFIED** here.
- Turn the butterfly off before ending a run so it does not remain over later screenshots.

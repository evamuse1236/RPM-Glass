# RPM playground

Run `npm run playground` and open the address it prints (http://127.0.0.1:4180/ unless that port is busy). The page shows a Galaxy S24 FE screen (384 × 832) with buttons for Capture, the planner, the notch and the home widget, plus 200% text, dark mode, Back, Reset to sample data, Load companion.json and Download data.

Capture and the planner are the real pages: the server reads `android-companion/` (and `runtime.mjs` with everything it imports) fresh on every request, so after you change a file you only reload the browser tab. Java is replaced by `fake-native.mjs`, which answers every bridge action the way `CompanionActivity` does and keeps the data in the browser's localStorage; it has no AI key, so a capture keeps your words and offers Retry, as the phone does without a key.

The notch and the widget are copies of native Android views (`NotchPill`, `NotchContent`, `NotchScene` and `res/layout/widget.xml`), redrawn in HTML and marked "Copy" on screen. They read the same saved data, so they react to the planner, but a change to them here does not change the phone; edit the Java and then the copy (`notch-*.mjs`, `widget-view.mjs`) together.

On the Notch screen, `Alert:` shows the reminder island (it folds back to the pill after 6 seconds) or the ringing alarm island (it stays until Snooze or Stop), and `Animate open` plays the pill-to-island morph. The pill takes the planned swipes: right or pull down opens the island, left snoozes, and a long press opens the task. The phone's notch has the same island, alert islands and swipes (`IslandView`, `NotchAlertViews`, `NotchAlerting`, `IslandGesture`); there the alert islands come from the app's real reminders and ringing alarms.

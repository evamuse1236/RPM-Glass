# Notch island: what Apple's Dynamic Island guidance teaches us

Study date: 2026-10-19. Sources: Apple HIG "Live Activities" (updated 2026-10-13), ActivityKit and WidgetKit docs, WWDC23 "Design dynamic Live Activities" (10194), WWDC26 "Live Activities essentials" (223), HIG Motion, Accessibility, Color and Dark Mode pages.

Confidence: the HIG size table and the ActivityKit limits were read from Apple's pages. The WWDC points come from page summaries, not transcripts. Treat those as strong hints, not quotes.

## Licence limits

- SF Pro and SF Compact fonts may not ship on Android. Keep the system sans (Roboto / Google Sans).
- SF Symbols and the Live Activities Figma template: licence not read. Ship no Apple glyphs. Our own `ic_*` drawables stay.
- Apple's numbers are in points for iPhone. We copy proportions and rules, not pixels.

## Apple's model in one screen

| Presentation | When | What it holds |
|---|---|---|
| Compact | One activity running | A leading and a trailing view, hugging the camera, as narrow as possible. 52–62 × 37 pt. |
| Minimal | Several activities | One small circle or oval with one live value (a ring, a number). Never just a logo. |
| Expanded | Long press, or an alert | Leading and trailing beside the camera, center below it, bottom row. 84–160 pt tall. |
| Alert | Essential update only | The expanded view, with the trigger fact emphasised, then it collapses. |

Rules that apply to us:

1. **Tap opens the app at the right screen; touch and hold expands.**
2. **Fill the space beside the camera.** No empty band above or beside the sensor in the expanded view.
3. **Concentric shapes, even margins.** Inner corner radius = outer radius − margin. Keep content off the edge.
4. **One control, two at most.** Buttons cost space and cause mistaken taps.
5. **Large text, medium weight or heavier.** Small text sparingly. Black opaque background, one bold tint per activity.
6. **Consistent placement.** What sits leading in compact sits leading in expanded.
7. **Motion under 2 s.** Numbers roll (numeric transition). Move elements rather than remove and re-add them. Reduce Motion turns moves into fades.
8. **Alert rarely.** Only for something the person must act on now. Never duplicate an alert with a notification.
9. **End promptly.** When the task ends, leave the island; show a short summary at most.
10. **Show live information.** A countdown or a ring, not a static icon.

## Where our notch already matches

- Black opaque island, floating 12dp from each side, top at the pill's top (IslandShape).
- The split circle beside the pill is Apple's detached minimal view.
- Morphs are 300–350 ms with 90/210 ms cross-fades, well under 2 s. Reduce Motion is respected (`areAnimatorsEnabled`).
- The pill's trailing value is live: minutes left, or the start time.
- Alerts only for reminders and alarms; a reminder never says "alarm" (NotchFrame).
- Accent per kind: water blue, habit green, meal yellow, task tile blue.

## Gaps, ranked

Evidence: `.verify/evidence/2026-10-19T07-31-36-182470/notch-lunch-on-crop.png` (open island), `crop-02-reminder-island-phone.png` in the 2026-10-18 notch run (pill).

1. **Empty band over the camera in the open island.** The top ~45dp is blank. Apple puts leading and trailing content beside the camera. Fix: leading = kind glyph; trailing = the live value (the same "45m" the pill shows). The title then sits right under them. Saves height and keeps compact and expanded consistent.
2. **Three controls in a row (Done, Snooze, Log meal), one greyed.** Apple says one, two at most. Fix: one primary control for the hero (Done, or Glass when water is the hero). Secondary actions move to rows or to the app. Hide a disabled control instead of greying it.
3. **The pill's leading view is a static icon in a grey circle.** Apple: compact shows live data, not a logo. Fix: the leading view becomes a progress ring around the kind glyph (time used, or glasses drunk), tinted by kind.
4. **The pill is wide (140dp minimum) with a long clock string ("2:27 AM").** Apple: as narrow as possible, short units. Fix: "2:27" without AM/PM when within 12 hours; "45m"; shrink the minimum width.
5. **Content swaps by cross-fade.** Apple: move persistent elements and roll numbers. Fix: the glyph and value travel from pill to island positions on open; water count and minutes use a rolling digit.
6. **Corners are not concentric.** Outer 32dp, padding 16dp, task tile 12dp. Fix: tile radius 16dp (32 − 16). Alert island 28dp → inner 12dp.
7. **Tap vs hold differ from Apple.** Ours: tap opens the island, long press opens the hero in the planner. Apple: the reverse. Keep ours. Android has no system island, so the first tap must show it. Record the choice as intentional (AGENTS.md rule "A tap anywhere on the notch pill opens the island").

## Not adopted

- Live Activity lifetime (8 h) and the 4 KB payload: iOS mechanics, not design rules.
- Lock Screen banner: Android's lock screen is out of scope for the notch.
- StandBy and CarPlay layouts.

## Next

A design plan for gaps 1–6 (fable-designer), a clickable mock, then a build on top of `feat/notch-in-place`. Each gap gets a test in `NotchSceneTest` / `IslandShapeTest` before it ships.

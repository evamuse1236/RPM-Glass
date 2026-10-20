# Design track report, 20 Oct 2026

Round 2 (below) replaces round 1's floating + and Search buttons, the 22px Capture field, and the meal reveal's look.

Branch `gauntlet/design` in `RPM-Glass-g-design`. Plan: `design-plan.md` in this folder; its "Orchestrator decisions" won where they differ.

Screenshots are in `design-shots/<item>/`. Each was taken in the playground (`node playground/server.mjs`), at 384 × 832, in light and dark, by a headless Chromium. Touch gestures were sent as real touch events. `npm test` exited 0 after every commit.

## What the user now sees

| Plan item | Status | What changed for the user | Shots | Commit |
|---|---|---|---|---|
| 1. Floating tab bar | Done | The tab bar floats 16dp in from the sides and bottom: 64dp tall, 20dp corners, a thin border, and one pill that slides between tabs. The + and Search buttons share its right edge and sit 16dp above it. The snackbar sits 16dp above it too. | `1-tab-bar/` | dd3dde8 |
| 2. Capture composer | Done | The composer floats 16dp from the edges, with 36dp corners and a thin border in both themes. There is no blue focus ring. The mic and Send share one place and cross-fade. Cards keep stacking above the composer, as in v0.30, with 20dp corners. | `2-capture/` | 08aac51 |
| 3. Radius tokens | Done | Sheets have 36dp top corners and a thin border. Cards on Today, Blocks and Projects have 20dp corners. | `3-radius/` | 7f92e1e |
| Decision 4: untimed tasks for today | Done | A task dated today with no time shows on Today in an "Anytime" group right after the now line. On other days the group comes first. Each task has its own ring. | `d4-anytime/` | e4ae06d |
| Next-card cue | Done | Only the next task has a primary bar on its card's edge and "in 40 min" (or "in 4 h") under its time. | `next-card/` | 60e489f |
| 4. Spine drag and knurl | Done | Hold a timed card still for 250ms and it lifts. Drag it up or down and a label shows the new time, in 15-minute steps. It saves on release, with Undo. A quick vertical drag still scrolls. A small bar at the card's foot drags the length; a tap on it opens the Length row. | `4-spine-drag/` | fdcc99f |
| 5. Time and Length sliders | Done | In the task sheet, Time and Length are sliders with the value at the right end. Tapping the value opens the old chips. A slider saves when let go, with Undo. | `5-sliders/` | 9b7bce9 |
| 6a. Water drag | Done | Drag across the Water row to add one glass per 24dp. A label shows "7 of 8" and a thin track fills in. The glasses save as one change with one Undo. | `6-water-meal-question/water-*` | acfa07c |
| 6b. Meal swipe | Done | Swipe an unlogged meal right to log its usual food now ("Lunch logged · Dal rice", with Undo). With no usual food, the meal sheet opens. | `6-water-meal-question/meal-*` | acfa07c |
| 6c. Question swipe | Partly done | On a "Which one?" card, the first chip has a check. A right swipe on the card picks that chip; a tap on any chip still works. "Likely" and the preview line are not built (see below). | `6-water-meal-question/question-*` | d0d3559 |
| Decision 3: Start now | Done | A "Start now" chip under the task title makes the task begin at this minute today, with Undo. It hides while the task runs, once it is done, and on repeating tasks. A tap on a task still opens the sheet at once. | `d3-start-now/` | 00b9609 |
| 7a. Tab bar slide | Done | Drag sideways along the tab bar: the pill follows the finger, and letting go opens that tab. Tapping a tab still works. | `7-tab-slide/` | f521847 |
| 7b. Add long press | Done | Hold + for 400ms to open Capture. A tap still opens Add task. | `7-add-long-press/` | e77fffb |
| 7c. Inbox to Today | Done, as a swipe | Swipe an Inbox task left: Today, Tonight, Tomorrow, Tomorrow morning 9:00 AM and This weekend come first, and Move to Block comes last. Today takes two taps, and the task then shows in Today's Anytime group. | `7-inbox-to-today/` | cc1ca9f |

## Tests added or extended

- `android-companion/spine-model.test.mjs`: the Anytime group's place, the countdown on the next card only, and `soonText`.
- `android-companion/spine-drag.test.mjs`: a vertical drag before 250ms scrolls and never moves a card; a sideways drag is a swipe; lift, drag and drop; time and length snaps; the 24dp edge guard; glasses per 24dp.
- `android-companion/fact-slider.test.mjs`: slider ranges, the nearest stop, one save on release, and the TalkBack value text.
- `android-companion/capture-question-swipe.test.mjs`: the swipe picks the first choice with the same action as a tap; an answered question has no swipe.
- `android-companion/start-now.test.mjs`: when Start now is offered and the time it writes.
- `android-companion/nav-drag.test.mjs`: the tab under the finger, and the pill kept inside the bar.
- `android-companion/task-swipe.test.mjs`: Inbox swipe-left choices.

The AGENTS.md rows for swipes, the task sheet, water, and "Which one?" were updated with these tests in the same commits. Docs updated: DESIGN.md, `docs/design/components.md`, `docs/planner-surface-contract.md`, and the `verify-rpm-glass` feature files.

## Calls I made where the plan was silent or clashed with the brief

1. The Capture field stayed at 22px in round 1. Round 2's decision 2 changed it to 16/24 (see below).
2. Sliders save when let go, not at each step, so one drag makes one change and one Undo.
3. A 250ms hold now lifts a spine card. The quick menu therefore opens on release after a hold of 400ms or more, or on right-click.
4. Repeating tasks cannot be dragged on the spine and get no Start now, because both would move the whole series.
5. Inbox "drag-to-Today" is built as the swipe-left menu from the plan's Inbox line ("Move (Today, Tomorrow 9 AM, a Block)"). There is no drag from the sheet onto the spine.
6. The question card's check marks only what the swipe picks. I did not add the word "Likely": the AI does not rank its choices, so the tag would be a guess. I also did not add the preview line, because choices carry no result to preview. Ranking would need `intent-v2`, which another agent owns.
7. The Water drag only adds glasses. No store operation removes a saved glass, so Undo is the way back.
8. Capture cards got 16dp of shadow room at the sides, so their shadows no longer end in a square edge.

## Not built

- Hold-to-talk on the mic, and the top-bar mic opening Capture already listening. Both need a native speech change.
- Distinct haptics (`hold`, `tick`, `confirm`). The native bridge plays one tick for every kind.
- The free-time `+` picker, "fits N Inbox tasks", the reordered schedule menu ("In 1 h" first), swiping empty spine space to change the day, and the week line that opens the weekly review. There was no time left for them.
- A fresh-context critic score against the plan's rubric. The brief did not allow reviewer agents.

## UNVERIFIED

- The real app. No emulator or phone was used (the brief forbids starting one), so nothing here was checked in the Android WebView. `npm run check:evidence` fails because the APK is older than the changes.
- `rpmctl scenario --all` was not run.
- Haptics, real finger feel, Samsung behaviour and TalkBack.
- Capture with the real AI. The question card was driven with a stub model that returns a "Which one?" question.
- 200% text. It was spot-checked only on the Start now chip, which does not cut off.

## Round 2: the critic's list (overlap 3/10, size 5/10, overall 6/10)

Shots are in `design-shots/round-2/<fix>/`. `npm test` exited 0 before each commit.

| Fix | What changed for the user | Measured in the playground | Shots | Commit |
|---|---|---|---|---|
| 1. Add in the tab bar | Nothing floats over rows any more. Add is a 48 × 48 button at the bar's right end (12dp corners). A tap opens quick add; a 400ms hold opens Capture. The four tabs share the rest of the bar. Search is in the top bar beside the mic. "Now" is a small pill on the bar's top edge, shown only when now is off screen. It hides while a snackbar shows. On detail pages Add hides and the four tabs fill the bar. | Add at x 312, 8dp inside the 64dp bar, 48 × 48, r12. Tabs 70dp each with Add, 84dp without. | `1-add-in-bar/` | f4818c4 |
| 2. Capture field | The field is 16/24 with 12 20 4 padding. | 16px/24px. Composer 108dp tall at rest, 16dp from each edge. | `2-4-capture/` | 0db058e |
| 3. Capture cards | Cards have a 1dp outline border, 20dp corners, and sit 8dp above the composer. Choice chips have 8dp corners and an 18px icon for what they do (delete, done, or an arrow). Answer chips show the field's icon (clock, timer, bell…). No "Likely" tag. | Border 1px rgb(68,71,70), r20, gap 8. Chip r8, icon 18px. | `2-4-capture/` | 0db058e |
| 4. Send | Send is the one lit control: #A8C7FA with a #062E6F icon, in both themes. | rgb(168,199,250) / rgb(6,46,111). | `2-4-capture/` | 0db058e |
| 5. Drag label and gutter | While moving a card, its time label sits 12dp above the card's top edge (below it near the top of the list), never over the title. A length like "3 h 55 min" wraps to "3 h" over "55 min". | Gap 12. Gutter text stays inside the screen. | `5-7-spine/drag-*`, `gutter-*` | e889e08 |
| 6. Knurl | Only timed cards that have not ended show the length knurl. Past, done and Anytime cards show none. | Knurls on future cards only. | `5-7-spine/drag-*` | e889e08 |
| 7. Meal reveal | The reveal has the card's 20dp corners on its outer side. Below 7em wide it shows only the icon, so "Log now" is never cut. | Icon only at 70 and 120dp; whole word at 132dp and wider. | `5-7-spine/meal-*` | e889e08 |
| 8. Add in dark | Add uses the secondary-container colours, like the active pill, with no shadow. | rgb(0,74,119) in dark, rgb(211,227,253) in light. | `1-add-in-bar/`, `9-overlap/*-dark` | f4818c4 |
| 9. Overlap re-check | At the end of Today, Blocks, Life and the Inbox sheet, nothing is under the bar, Now pill or snackbar, in light and dark. The page gets extra end room while a snackbar shows. | `covered: []` at every scroll end, with and without a snackbar. | `9-overlap/` (readout in `overlap-readout.txt`) | this report |

Tests added: `floating-layout.test.mjs` (Add in the bar, hold to Capture, Search in the top bar, Now pill), `capture-look.test.mjs` (field, Send, cards, chips, gap), more cases in `capture-question-swipe.test.mjs` (chip icons) and `spine-drag.test.mjs` (label place, gutter wrap, knurl rule, meal reveal). AGENTS.md rows for Search and Add, swipes and "Which one?" were updated in the same commits.

Notes on round 2:

- The composer is 108dp at rest, not about 104. The 48dp Send row and the 16/24 field with 12 20 4 padding need that much.
- Fixes 2 to 4 are one commit, and fixes 5 to 7 are one commit: each group shares the same files and tests.
- Content passes under the bar and snackbar in the middle of a scroll, as on any floating bar. The check is that every row can scroll clear, which it can.
- In the Inbox, ticking a task closes the sheet, as before round 2. The Inbox check therefore used a snackbar from a tick made just before opening it.
- The Now pill sits on the bar's top edge. While visible, it can cover the top of a row passing just above the bar. It hides as soon as you scroll down or a snackbar shows.

Round 2 UNVERIFIED: the same items as above (no emulator, no `rpmctl scenario --all`, haptics, real touch, TalkBack, the real AI, 200% text).

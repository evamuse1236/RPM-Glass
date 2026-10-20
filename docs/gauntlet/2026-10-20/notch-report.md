# Notch gauntlet report, 2026-10-20

Branch `gauntlet/notch`. The scenario catalogue is in `notch-breaks.md`. The rules are in `docs/rules/notch.md`. Each fixed scenario has a rule row and a test that failed before the fix and passes after it.

## What changed for the person

- Lock the phone, let it sleep, or turn it sideways: the island now comes back as the pill, not as an island that opens over the app without a tap.
- The island can always log water. At large text, the hero's own reminder row no longer pushes the water row out.
- A face too tall for the screen now drops rows first and then shortens its title. It is never cut at the bottom. Before, the alert controls lost `Open` at 200% text.
- On a wide notch (not a punch hole), the pill keeps the whole notch width clear.
- If the store cannot be read for a moment, the notch keeps what it last showed. Before, it disappeared.
- A tap on the open island's title and line opens the task, as the alert island's words already did.
- Every control, row and Undo shrinks to 0.97 while pressed, the same as in the copy.
- An alert row's Done circle now lines up 16dp from the edge with every other row value.
- The Undo pill keeps its side padding. Before, it was a ~35dp blob on the phone, with "Undo" spilling past it.
- Opening and closing, the island's words shrink and grow with it. Before, its edges cut them ("all: merge sections").

## Scenarios

| # | Scenario | Status | Proof |
|---|---|---|---|
| 1 | Lock, sleep or sideways reopens the island | Fixed | `IslandStateTest.lockingSleepingOrTurningThePhoneSidewaysClosesTheIsland`, `theControllerClosesTheIslandWheneverThePhoneHidesIt`; emulator `before-3-after-unlock.png` → `after-3-after-unlock.png`, `after-12-back-from-landscape.png` |
| 2 | Hero's alert row pushes out due water | Fixed | `NotchAlertRowsTest.theHerosOwnAlertRowNeverPushesDueWaterOutOfTheIsland`; playground test `the hero's own alert row leads ...`; `final/09-long-title.png` |
| 3 | Faces over the 60% cap are cut | Fixed | `IslandShapeTest.aFaceTooTallForTheScreenDropsRowsThenShortensItsTitleAndIsNeverCut`; playground test `a face too tall ...`; `final/13-max-text-manage.png` (no clip) |
| 4 | Wide notch keeps only ~42dp clear | Fixed in code; native **UNVERIFIED** | `NotchAnchorTest.aWideNotchKeepsItsWholeWidthClear`; playground test `a wide notch ...`. The emulator's cutout overlays had no effect on Pixel_9. |
| 5 | Unreadable store hides the notch | Fixed | `NotchFrameTest.anUnreadableStoreKeepsWhatTheIslandShowedInsteadOfHidingIt` |
| 6 | No tap to open the hero task | Fixed | playground test `the open island's title and line open the task ...`; `notch-ops.test.mjs`; emulator `after-4-title-opens-task.png`, log `notch.open_task opened {"taskId":33}` |
| 7 | No press scale in Java | Fixed | playground test `every control shrinks to the same scale ...`; emulator `after-press-held-on-done.png` |
| 8 | Done circle at 10dp | Fixed | playground test `an alert row's Done circle ends 16dp ...`; `final/02-open.png` |
| 9 | Copy row titles not clamped | Fixed | playground test `a row title keeps the phone's line count in the copy ...`; `final/12-many-due.png` |
| 28 | Morph cuts the words (found while driving) | Fixed | `IslandShapeTest.facesShrinkWithTheIslandInsteadOfBeingCutByItsEdges`; playground test `faces shrink with the island ...`; emulator `before-13-morph-cuts-words.png` → `after-13-morph-scales-words.png`, `after-14-closing-midway-final-build.png`; `final/16-morph-midway.png` |
| 29 | Undo pill padding lost (found while driving) | Fixed | playground test `Undo and every pill keep their side padding ...`; emulator `after-done-receipt-before-undo-fix.png` → `after-7-glass-receipt-undo.png`, `after-8-undone.png` |
| 10–23, 25, 26 | Empty day, long title, many due, alarm plus reminder, landscape, immersive, keyboard, split screen, wallpaper, process kill, service off, planner open, Undo refused, midnight, top-edge pull, reduced motion | Fine | See `notch-breaks.md`; existing tests are named there |
| 24 | Camera hole in a corner | Known | The ring can sit under a corner hole. Not the S24 FE layout, so I left it. |
| 27 | Minute tick drops a press that is down | Known | Rare (needs a press at the exact minute change). Fixing it means keeping the face across a line change, which touches the frame key. Left for a later change. |
| — | Alarm heads-up notification sits under the island | Known, needs owner | The duplicate alert lives in `CompanionAlarmService`, outside notch scope. Options: drop the heads-up while the notch shows the alarm, or keep it for when the notch is off. |

## Design changes

- Press: 0.97 scale over 100 ms on every control, row, Undo and the island's words (phone and copy).
- Morph: faces scale from their top centre with the island width. A settled face is drawn at its own size.
- Fit order: open island drops to 3, 2, 1 rows, then a 2-line title; other faces keep 3 rows and shorten the title.
- The 36/20 concentric corners and the 16dp margins are unchanged.
- No new gestures. The only new tap target is the open island's words, which sit inside the island, away from the screen edge.

## Screenshots

- Playground, before: `docs/gauntlet/2026-10-20/notch-shots/round-0/` (15 scenes).
- Playground, final: `docs/gauntlet/2026-10-20/notch-shots/final/` (17 scenes, including the slowed morph `16-morph-midway.png`).
- Playground, round 2: `docs/gauntlet/2026-10-20/notch-shots/round-2/` (20 scenes, including black wallpaper and 5+ due items).
- Round 2 rpmctl shot: `.verify/evidence/2026-10-20T07-58-17-256507/01-screen.png` (not committed).
- Emulator (Pixel_9, 1080x2424, 420 dpi): `docs/gauntlet/2026-10-20/notch-shots/emulator/` (`before-*` and `after-*`).
- Final-build rpmctl shot: `.verify/evidence/2026-10-20T06-14-08-42a26c/01-notch-pill-final.png` (not committed).
- The shooter: `node docs/gauntlet/2026-10-20/shoot-notch.mjs <outDir> [port]` against `node playground/server.mjs 4290`.

## Round 2: the critic's ranked list (critic report `/tmp/gauntlet/notch-critic-r1.md`)

| # | Decision | Commit | Tests | Shots |
|---|---|---|---|---|
| 1 | No ghost frame: while the notch shows a ringing alarm on an unlocked screen, its notification posts to a quiet channel without heads-up or full-screen intent; asleep or locked, it rings full-screen as before | b39569c | `AlarmHeadsUpTest` | `emulator/r2-1-alarm-without-heads-up.png` (measured: channel `companion_alarms_notch`, importance 2, `fullscreenIntent=null`; asleep it switched to `companion_alarms` with the intent) |
| 2 | Alarm: Stop is the full-width primary, Snooze 10 min and Done a pair under it; corner Stop circle removed. A reminder keeps Done | 293990e | JS `a ringing alarm ...`, `NotchFrameTest` | `emulator/r2-2-alarm-stop-primary-pair-under.png`, `round-2/04-alarm.png`, `14-max-text-alarm.png` |
| 3 | Rolling digits clip to their cap height; opening widens first, closing narrows last; faces shrink with the island | d3ff0bd | `IslandShapeTest` (2 new), 3 JS | `emulator/r2-3-digit-roll-frames.png`, `r2-3-open-morph-frames.png`, `round-2/16-morph-midway.png` |
| 4 | The time shows once, in the band; the line is the purpose, else the block, else Now/Next | ac2bd17 | `NotchSceneTest.theTimeShowsOnce...`, JS | `emulator/r2-6-open-rows-time-once-more.png` ("Confident for RM Quiz I") |
| 5 | Side margin = top margin (4–16dp); last control 16dp above the bottom | dab1b8f | `IslandShapeTest.openIslandSitsAsFarIn...`, JS | `emulator/r2-6-*`, `round-2/02-open.png` |
| 6 | Each row ends in one quiet 40dp circle; water dots only at normal text | c028365 | JS `every row ends in one quiet ...` | `emulator/r2-6-*`, `round-2/02-open.png` |
| 7 | Done is the filled primary with a dark label; Undo shows its 5 s draining | 886bfa3, f0db027 | `NotchFrameTest.primaryControls...`, `NotchAlertRowsTest.undoShows...`, 2 JS | `emulator/r2-7-undo-countdown-2s-and-3s.png`, `round-2/05-receipt-undo.png` |
| 8 | Large text: icons grow up to 1.5x, pills keep 8dp round their label, row controls grow (corner stays 20dp), "+N more" when items are left out; the next alert no longer shows twice | bb829cd | `NotchSceneTest` (2 new), `NotchAlertRowsTest.theNextAlertShowsOnce...`, JS | `emulator/r2-8-large-text-150-open.png`, `round-2/10`, `12b`, `13`, `14`, `15` |
| 9 | Black wallpaper: floating islands get a 1dp white 8% edge (none on the pill); 5+ due items and the empty day re-shot | 8a9e74d | `IslandShapeTest.aFloatingIslandHas...`, JS | `round-2/11-black-wallpaper-open.png`, `11b`, `11c`, `12-many-due.png`, `07-empty-day.png` |

Choices made where the brief was silent:
- The empty day is no notch at all, only the camera (the phone already hides it when nothing is due). The playground's note moved off the status bar into the copy badge area.
- "+N more" only speaks; it is not a button. The long press already opens the plan.
- At large text a row control grows to its icon plus 10dp each side and keeps its 20dp corner, so it turns into a rounded square past 40dp.
- The routine row's circle snoozes only the routine.

Known gaps:
- While the island opens, its edge still sweeps over the status clock for a few frames. An overlay cannot hide the system clock; widening first shortens that window (measured on the emulator, frames in `r2-3-open-morph-frames.png`).
- The playground copy's meal rule is older than the phone's (any time slot, including snack, vs the phone's meal-plan windows), so the copy can show a Snack row and a larger "+N more" than the phone. Not fixed here.

## UNVERIFIED

- Black wallpaper on the device: the hairline is shown in the playground only.
- The full-screen alarm on a real lock screen: the emulator has no keyguard.
- Wide-notch layout on a real wide notch: the emulator cannot show one.
- Samsung One UI and the S24 FE's real cutout. The emulator is a Pixel_9.
- Reminder Snooze, and alarm Stop and Snooze, on the device. Alarm Done and the reminder island were driven.
- Battery saver's effect on the morph and press.
- How the 0.97 press feels under a finger. Screenshots show only the held state.

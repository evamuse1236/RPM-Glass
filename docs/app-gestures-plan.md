# Direct-manipulation plan for RPM (S24 FE, 384dp, One UI 100%)

Design plan by fable-designer, 2026-10-19. User ask: "where possible design ux which will make it easier to make chocies, sliders, knobs, drag, swipe, double tap swipe left and right, long press etc". Builds on `docs/app-redesign-plan.md`. Text target: One UI default (100%); enlarged text is not a target.

Builder files to touch: `task-swipe.mjs`, `planner/row-gestures.mjs`, `planner/spine-view.mjs`, `planner/today-row.mjs`, `planner/task-facts.mjs`, `planner/water.mjs`, `planner/today-header.mjs`, `gestures.css`, `CompanionActivity.java` (bridge), `IslandView.java`.

## Direction

A finger on a thing moves that thing, and the value it changes is written next to the finger. No gesture hides behind a mode. Each gesture has a visible handle (grabber, knurl, thumb) and the same result through a tap. The memorable thing is the Today spine: tasks slide along the rail like beads, and the time reads out under the finger.

## 0. Shared machinery

**Haptic bridge.** Extend `native('haptic')` to take `{kind}`: `tick` → `CLOCK_TICK`, `step` → `SEGMENT_TICK` (API 34), `confirm` → `CONFIRM`, `reject` → `REJECT`, `hold` → `LONG_PRESS`, `start`/`end` → `GESTURE_START`/`GESTURE_END`. Missing kind falls back to `CLOCK_TICK`. At most one tick per 40ms, and never a tick without a value change.

**Constants** (existing kept): axis lock 8px, `X_BIAS` 1.2, commit 90px, long press 400ms. New: 24dp edge zone each side; a `pointerdown` in it never starts a horizontal gesture (vertical is fine). Rows get `user-select: none; -webkit-touch-callout: none`; text selection stays in fields and notes.

**Drag feel.** The dragged element follows the finger by `transform` on each pointer event (no transition while `data-dragging`). Release: 200ms `--ease-emphasized-decelerate` to the snap; no overshoot. A drop that changes data commits once and shows the snackbar with Undo (6 s). Reduced motion: jump to the snap; labels stay.

**Live label.** One shared pill (`.drag-label`): 28dp tall, radius 14, `--bg-elevated`, `--footnote` 500 tnum, sheet shadow, 12dp above the finger. Text = the value being chosen ("10:15 AM", "1 h 15 min", "Tomorrow").

## 1. Per surface

### Today spine (biggest win)

```
 9 AM ○─┬ ┌──────────────┐
        │ │≡ Write intro │   ← grab on the card body
10 AM   │ │   ┄┄ 45 min  │
        │ └──────▬───────┘   ← ▬ 24×4 knurl, bottom-centre, --label-3
        ╎  [ghost at 10:15]    ghost = dashed --tint outline, --tint-soft fill
```

- **Hold 250ms, then drag a card vertically = move its start.** The card lifts (scale 1.02, sheet shadow, haptic `hold`) and page scroll locks. Start snaps to 15 min (12dp at 48dp/hour). The live label shows the new start; a ghost sits at the snap; the rail between old and new tints. `tick` per snap. Release: `confirm`, settle 200ms, snackbar "Moved to 10:15 AM · Undo". Within 24dp of the viewport top/bottom it auto-scrolls 6dp/frame. Dropping on a calendar event is allowed (a clash row appears).
- **Drag the bottom knurl = change duration.** Snap 5 min under 30 min, 15 min above; min 5 min. Label "45 min", `tick` per snap; the card grows (160dp cap stays, label keeps counting). Release `confirm`, snackbar "45 min · Undo".
- **Swipe right / left** unchanged (Done / Schedule). On a timed card, left = "Move time" opens the time sheet.
- **Double tap a card = Start now** (start = now, snap 5 min). Snackbar with Undo. A single tap still opens the sheet; the double tap needs a 250ms wait, so Settings can turn it off (default on, with a first-use hint).
- **Swipe horizontally on empty page space = previous/next day**, shared-axis X 300ms. Not from the 24dp edge zones. Cards take their own horizontal drags, so this fires only on the gutter, free-time rows and the header.
- **Week strip**: swipe = week. While a card is lifted, the strip rings the day under the finger (`--tint-soft`); drop = same time on that day. Label "Wed".
- **Free-time rows**: `+` stays. Dropping an Inbox task on a free-time row puts it at the gap's start.
- Tap path: task sheet Day/Time/Length rows.

### Block detail (Plan list)

- Long press 400ms on a Plan row = reorder (as now): the row lifts (`hold`), others slide 250ms, `step` per slot, `confirm` on release. Dropping above the dashed `--must` line marks it Must. Tap path: quick menu "Mark as Must".
- Swipe right = Done, left = Schedule (existing).
- Double tap a row = toggle Must (star pop `--ease-spring`, `confirm`), snackbar "Marked Must · Undo".

### Blocks list

- Swipe right on a Block card = Mark achieved: opens the "Is this Result achieved?" confirm (ticked tasks don't decide it); the card springs back. Swipe left = deadline to tomorrow 11 PM, with Undo. Long press = menu (Open, Move to project, Archive).

### Inbox

- Swipe right = Done, left = Move (existing). Long press lifts the row; hovering on the Today tab for 500ms switches to Today (tab pulses), then the spine works as above. Released elsewhere: springs back. Haptics `hold`, `tick` on tab hover, `confirm` on drop.

### Task sheet

```
 ▦ Day    ‹ Today | Tomorrow | Wed | Thu ›   ← stays chips
 ◷ Time   [ 6:00 ─●────────── 11 PM ]  10:30 AM   ← scrub slider
 ⏱ Length [ 5m ──●──── 4 h ]           1 h 15 min
```

- **Time = scrub slider** (replaces the 34-chip row). Track 4dp `--fill`, thumb 28dp `--tint`, hit box 48dp. Range 6:00 AM–11:00 PM, snap 30 min; dragging more than 24dp below the track switches to 15-min fine mode (label turns `--tint`, `step` haptic). The task's off-grid time shows as a hollow tick and snaps within 7 min. Value on the trailing side (tnum, `--headline`). Commit on release, `confirm`. Tapping the track jumps and commits. Tap path: tap the value → `<input type=time>`. Not set = thumb parked at the start, "Time not set".
- **Length = slider** 5 min–4 h, snap 5 min to 30, then 15. Tap path: the value → number field.
- Day, Alert and Repeat stay chips.
- Swipe right on the sheet header = Done.

### Habits, water, meals

- Water: the stepper stays. Drag horizontally on "3 of 8": 24dp per glass, `tick` per glass, `confirm` on release, Undo. Settings sliders: goal 1–20 (snap 1), interval 15–240 (snap 15).
- Meal row: swipe right = Log now (`--success`, `confirm`); left = Skip today; long press = Edit times.
- Routine steps: swipe right = Done step.

### Capture cards and questions

- Choice chips stay taps. Swipe right on a question card = the first (recommended) choice; left = "Neither / say more" (focuses the composer). The reveal layer shows the choice's words. Commit 90px.
- Receipt: swipe left = Undo (same as the button).
- Long press a proposal card = Edit (sets Edit focus).
- Mic: hold = push to talk; swipe up = lock listening. Tap path: tap mic.

### Weekly review

- Swipe between the 4 steps (outside edge zones, not on a row). A result row: swipe right = achieved, left = "Not this week", with Undo.

### Settings

- Sliders: 4dp track, 28dp knob, snap per setting, `tick` per snap, value trailing. A 16dp horizontal drag on a switch knob toggles it.

### Notch island

- **Pill: swipe right = Glass, swipe left = Done on the hero task.** Commit 48dp. `confirm`, or `reject` when there is nothing to do. Long press = open planner (existing).
- Open island: swipe a row right = its primary (Done / Glass / Log). Drag the island up past 24dp = close.
- Native (`IslandGesture`), existing 8dp drift rule; `performHapticFeedback`.

## 2. Haptics

| Moment | Constant |
|---|---|
| Lift (long press reached) | LONG_PRESS |
| Drag starts (axis locked) | GESTURE_START |
| Every snap (15/30 min, glass, reorder slot) | CLOCK_TICK (fine mode: SEGMENT_TICK) |
| Swipe passes 90px | CLOCK_TICK |
| Commit | CONFIRM |
| Refused (nothing to do, calendar event) | REJECT |
| Cancelled / sprung back | GESTURE_END |

## 3. Conflicts

- Back gesture: no horizontal gesture starts within 24dp of either edge.
- Scroll vs swipe: 8px lock + 1.2 bias; card moves only after the 250ms hold, so scrolling is never hijacked.
- Long-press selection: `user-select: none` on rows; `setLongClickable(false)` on the planner WebView.
- Keyboard: no card drag while a field has focus.
- Double tap vs zoom: `touch-action: manipulation` on `body`.

## 4. Discoverability

- Visible handles: knurl on timed cards, slider thumbs, sheet grabber, a 6-dot grip that fades in on lift.
- First-use hints, once per gesture, one `--footnote` line that goes away after the first success. Double tap: one tip in the sheet header the first time a card is opened by tap.
- Settings → Gestures lists every gesture with its tap twin, and the double-tap toggle.

## 5. Tap twins

Every gesture has one: sheet rows, quick menu (Must, Move, Delete), ring tap (Done), `+` on free time, Glass/Log buttons, choice chips, Undo, Open/Close on the notch. TalkBack: sliders are `role=slider` with `aria-valuetext`; drag handles are buttons that open the matching sheet row.

## 6. Motion

Write `transform` on `pointermove`; `will-change` only while dragging. Release 200ms `--ease-emphasized-decelerate`; lift 100ms scale 1.02; reorder neighbours 250ms `--ease-standard`; ghost opacity 150ms. `--ease-spring` only for the Must star. Reduced motion: instant snaps; labels and haptics stay.

## 7. Ship first (taps saved per day)

1. Spine: hold and drag to move the start.
2. Task sheet Time and Length sliders.
3. Double tap = Start now.
4. Notch pill swipe right = Glass.
5. Inbox long-press drag onto Today.

## 8. Prototype first

1. Spine card: lift, 15-min snap with live label, knurl duration. Decides the 250ms hold and 12dp snap.
2. Time scrub slider with fine mode.
3. Notch pill swipe right / left with the 48dp commit.

## Open questions (the prototypes decide)

- Is the 250ms double-tap wait acceptable before the sheet opens? If not, drop double tap and add a "Start now" chip.
- Fine mode by dragging below the track, or always 15-min snaps (34 stops over ~300dp ≈ 9dp each)?
- Does the spine day-swipe fight the Capture button column? If so, change day only from the week strip.

## Prototype

`docs/mocks/gestures.html` (open it at 384px wide): spine drag with a 15-min snap, the duration knurl, Time and Length sliders with fine mode, double tap to start, and notch pill swipes.

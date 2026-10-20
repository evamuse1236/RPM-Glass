# RPM planner and Capture: design plan (2026-10-20)

Written by the design planner (Fable). The orchestrator's decisions on its open questions are at the end and override the body where they differ.

Screenshots the planner looked at: `/tmp/gauntlet/design-shots/*.png`, `/tmp/gauntlet/t3-composer.png`, `/tmp/gauntlet/t3-popover.png`. The sample data had no tasks, so Today with task cards, the Inbox sheet and the task sheet are described from CSS, not screenshots.

## Direction

Keep the Material 3 planner as it is: same type scale, same colour roles, same rows. Change its shape language only: everything that floats (tab bar, Capture box, sheets, FAB) becomes a rounded rectangle with a thin border, inset 16dp from the screen edge, like T3 Code's composer and popover. Corners are concentric: an inner corner is the outer corner minus the inset. The memorable thing is the Today spine: a finger moves a card along the rail and the time reads out under the finger. Nothing gets bigger.

## 0. Shape and surface tokens (add to `theme.css`)

```
--r-outer: 36px;   /* floats at the screen edge: Capture box, sheets */
--r-group: 20px;   /* cards, tab bar, lists, FAB Add */
--r-control: 12px; /* buttons, Search, active tab pill, snackbar, drag label */
--r-tile: 8px;     /* chips */
--inset-page: 16px;
--float-border-light: color-mix(in oklch, var(--outline-variant) 60%, transparent);
--float-border-dark: var(--outline-variant);      /* #444746 */
--float-surface-light: var(--surface-container);    /* #F0F4F9 */
--float-surface-dark: var(--surface-container-high);/* #282A2C */
--float-shadow: 0 2px 8px rgba(0,0,0,.10), 0 1px 2px rgba(0,0,0,.08);  /* light only; dark uses the border */
```

Rules:
- Inner radius = outer radius − inset, capped at half the element's height. A full pill (radius ≥ half height) is always allowed as a leaf (buttons, check ring, stepper).
- Keep `--card-radius` as an alias of `--r-group` so old rules follow.
- `--shape-xl` (28) is no longer used for sheets or Capture; replace with `--r-outer`.
- Keep type as is: body 14/16, labels 12/14, titles 16/22. Do not raise any size.

## 1. User journeys (taps before → after)

| # | Journey | Now | Where it is slow | After |
|---|---|---|---|---|
| 1 | Capture by voice (from planner) | Top-bar mic (1) → Capture opens → mic (1) → speak → Send (1) → Save (1) = 4 taps | Two mic taps; the words wait, then Send | Top-bar mic opens Capture already listening (1) → release → Send (1) → Save (1) = 3. Hold the mic to talk; letting go puts the words in the field with Send lit. |
| 2 | See what is next | Open app, Today opens at now = 0 taps | The next card is not distinct from the rest | 0. The next card gets a 3dp primary bar on its left edge and "in 40 min" in the gutter. |
| 3 | Complete a task | Ring tap or swipe right = 1 | Fine | 1. |
| 4 | Reschedule a timed task | Card (1) → Time chip row scroll → chip (1) → Back (1) = 3 + a scroll | 34 chips to scroll through | Hold and drag the card on the spine = 0 taps, time under the finger. Or swipe left → one-tap time menu = 2. In the sheet: Time slider. |
| 5 | Plan tomorrow from the Inbox | 7 taps for the first task, 4 per next | Every task goes through the sheet | Swipe left on empty spine space = tomorrow → free-time `+` (1) → pick the Inbox task (1) = 2 per task, placed at the gap start with its length. Inbox row swipe left → "Tomorrow 9 AM" = 2. |
| 6 | Log water / a meal | Water `+` = 1 per glass. Meal = 3 | Eight taps for eight glasses | Drag across the Water row: one glass per 24dp. Meal: swipe right = Log now with the last usual food, Undo. Log it stays. |
| 7 | Answer "Which one?" | Chip (1) → Save (1) = 2 | Choices look equal | 2, but the first choice is pre-marked "Likely" with a check and a one-line preview of its result; swipe right on the question = first choice. |
| 8 | Review the week | Today ⋮ (1) → Weekly review (1) → Next ×3 → Finish = 6 | Hidden in a menu | Week line on Today opens it (1) → swipe between steps → Finish (1). |

## 2. Gestures

Shared rules (kept from `docs/app-gestures-plan.md`): axis lock after 8px with 1.2 X bias; commit at 90px; long press 400ms; hold-to-lift 250ms; no horizontal gesture starts within 24dp of either screen edge (system Back); `touch-action: manipulation` on body; rows `user-select: none`; no card drag while a field has focus. Haptics through `native('haptic', {kind})`: `hold`, `tick`, `confirm`, `reject`, `end`.

Live label (`.drag-label`): 28dp tall, radius 12, surface `--inverse-surface`, text `--inverse-on-surface` label-large tnum, shadow `--float-shadow`, 12dp above the finger.

| Gesture | Where | Does | Visible hint (rest) | Feedback |
|---|---|---|---|---|
| Swipe right | Task rows, spine cards, Inbox rows, meal rows, question card | Done / Log now / first choice | None at rest; reveal from the first 8px | Reveal tinted from lock, filled at 90px, icon to 115% 40ms, `tick` |
| Swipe left | Task rows, spine cards | Schedule menu (Inbox: Move) | Same | Primary container reveal |
| Hold 250ms + vertical drag | Spine cards | Move start time, 15-min snaps | 24×4 knurl bottom-centre of timed cards, `--outline-variant` | Lift scale 1.02 + `--float-shadow`, ghost slot (dashed `--primary` 1px, `--primary-container` at 40%), label "10:15 AM", `tick` per snap, `confirm` on drop, snackbar with Undo |
| Drag the knurl | Spine cards | Change length (5-min snaps under 30 min, 15 above) | The knurl | Card grows, label "45 min" |
| Horizontal drag on the tab bar | Floating tab bar | Slides the active pill to the tab under the finger; commits on release | The pill | Pill follows the finger, `tick` at each tab |
| Horizontal swipe on empty spine space, the gutter or the date line | Today | Previous / next day | Date line chevron | Shared-axis X 300ms |
| Horizontal drag on "0 of 8" | Water row | One glass per 24dp, both ways | Faint 8-segment track under the count, 2dp tall | `tick` per glass, label "3 of 8", one Undo |
| Drag thumb | Task sheet Time and Length sliders | Pick a value | 28dp thumb on a 4dp track | Label above the thumb, `tick` per snap |
| Long press 400ms | Task rows, Block cards, meal rows | Quick menu | None | `hold` haptic; menu opens from the row (150ms) |
| Hold the mic | Capture | Talk while held; release puts words in the field | The mic | Mic fills `--bar-accent`, a 2dp level ring, label "Listening" |
| Drag the handle down | Capture box, sheets | Closes past 30% or a flick | 32×4 handle | 1:1 follow, 150ms out |

Every gesture keeps a tap twin (ring, sheet rows, `+`, chips, Undo, quick menu). TalkBack: sliders `role=slider` with `aria-valuetext`; the knurl is a button that opens the sheet's Length row.

## 3. Visual choices that make decisions easier

- Today: the next card has a 3dp `--primary` bar on its left inner edge and "in 40 min" in the gutter under the time. Free-time rows show "fits 2 Inbox tasks" in body-medium variant when at least one fits.
- Free-time `+` picker: a sheet listing Inbox tasks that fit the gap, each with its length chip; the first row is pre-selected and the primary button reads "Add Write intro at 10:00 AM".
- Schedule menu (swipe left): four choices with their time in the variant colour; the current one checked; "Tomorrow 9:00 AM" first in the evening, "In 1 h" first before 6 PM.
- Task sheet: Day stays chips; Time and Length are sliders with the value in title-medium tnum at the trailing end; a drag writes the value live.
- Capture proposals: every proposal row shows day, Block, length as icon chips. A question row: the first chip carries a check icon and a "Likely" tag; under the chips one quiet line previews the first choice ("Moves 'Call Amma' to 8:30 PM"). Swipe right on the row picks it.
- Chips: every chip has an 18px icon before its label (day `event`, time `schedule`, length `timer`, Block `target`, Inbox `inbox`). Chip width `max-content`; wrap, never truncate.

## 4. Floating tab bar (`#nav-bar`)

- `position: fixed; inset-inline: 16px; inset-block-end: max(16px, calc(env(safe-area-inset-bottom, 0px) + 8px))`. Width 352 at 384dp. Height 64. Radius `--r-group` 20. Padding 8 (pill radius 12).
- Border 1px: light `--float-border-light`, dark `--float-border-dark`. Surface: light `--float-surface-light`, dark `--float-surface-dark`. Shadow: light `--float-shadow`; dark none.
- Four equal columns. Each item: 48 tall, 64 wide pill area centred, icon 24 over label-medium 12/16, gap 2, colour `--on-surface-variant`.
- Active: pill 48×64 radius 12 in `--secondary-container`, icon filled, label `--on-surface` weight 700. One pill node slides between tabs (250ms `--ease-emphasized`); reduced motion jumps.
- Press: `scale(.97)` 100ms. Focus: `outline: 2px solid var(--primary); outline-offset: 2px`.
- Keyboard open: bar and FABs hidden (as now). Sheets open above it; the scrim covers it. Hidden on Settings, Search and the review (as now).
- Page padding: `.page { padding-block-end: calc(64px + 16px + env(safe-area-inset-bottom, 0px) + 16px) }`, plus the FAB stack height on root tabs (existing formula with `--nav-measured` = 64 + bottom offset). Content scrolls under the bar; the last 16dp fades with `mask-image`.
- FAB stack: right edge aligned to the bar's right edge (inline-end 16). Bottom = bar top + 16. Add: 56×56, radius 20, `--primary-container`, `--float-shadow`. Search: 40×40 above it, gap 16, radius 12, bar surface + border, no shadow. Long press on Add (400ms) opens Capture.
- Snackbar: inset 16, bottom = bar top + 16, radius 12, `--inverse-surface`; the FAB stack rises by the snackbar's height + 16.

```
│  ...spine...                              [🔍]   │  Search 40, r12
│                                           [ + ]  │  Add 56, r20
│  ┌─────────────────────────────────────────────┐ │  16 inset
│  │ (▣ Today)   ◇ Blocks   ▭ Projects   ✿ Life  │ │  64 tall, r20, 1px border
│  └─────────────────────────────────────────────┘ │
│            max(16, safe-area + 8)               │
```

## 5. The Capture composer (`.bar` in `capture.css`)

Dark in both themes. See decision 2 below: response cards keep the v0.30 structure.
- `inset-inline: 16px; inset-block-end: calc(var(--keyboard-inset, 0px) + 16px)`. Radius 36. Surface `--bar`. Border 1px `--bar-outline` in both themes. Shadow `--bar-shadow`.
- Handle 32×4, radius 2, `--bar-on` at 38%, 10dp from the top, 48dp touch strip.
- Field: body-large 16/24 (not larger), padding 12 20 4, one line minimum, `field-sizing: content`, max 6 lines then scrolls. Placeholder "Capture a thought". No outline, no ring. Caret `--bar-primary`.
- Controls row under the field: 56 tall, padding 4 8 12. Start: `+` 48 target. End: mic, 40 round in `--bar-highest` in a 48 target; becomes Send (40 round, `--bar-accent`) once text exists, 150ms crossfade.
- Cards (inside or above, per decision 2): radius 20, `--bar-high`, 1px `--bar-outline`, padding 16, gap 8. Chips radius 8. Buttons pills.
- Press: round buttons `scale(.96)` 100ms. Focus `outline: 2px solid var(--bar-primary); outline-offset: 2px`.
- Listening: mic fills `--bar-accent`, a 2dp ring scales 1 → 1.15 with the level. Reduced motion: static ring.

## 6. Per-screen changes

**Today**: top bar unchanged. Spine cards radius 20, `--surface-container-low` with 1px border `color-mix(in oklch, var(--outline-variant) 45%, transparent)`; the current card has no border; the next card has the 3dp primary bar; timed cards get the knurl. Water row 40 tall with an 8-segment track. Meal row swipe-right "Log now". Free time shows "fits N Inbox tasks".

**Task sheet**: top radius 36, 1px top float border. Swipe right on the header past 96px = Done. Time slider 6:00 AM–11:00 PM, 30-min snaps, value at the trailing end, "Not set" with the thumb at 38%; tap the value for the chip list. Length slider 5 min–4 h. Alert, Repeat, Block, Notes: as now.

**Blocks**: cards radius 20, `--surface-container-low`, 1px border. Swipe right reveals "Achieved?" and opens the confirm; never ticks silently.

**Inbox sheet**: top radius 36; rows 56; swipe right Done, swipe left Move (Today, Tomorrow 9 AM, a Block).

**Dark mode**: float borders `--outline-variant`; no shadows on floats.

## 7. Build order and proof

1. Floating tab bar + FAB stack + page padding. Proof: Today, Blocks, Life light and dark at 384×832 with the 16dp inset, border, pill radius 12, FAB aligned to the bar; scrolled to the end, the last row fully visible above the bar.
2. Capture composer geometry. Proof: empty, typing, proposals, question, receipt; an `eval` measuring left edge 16px and radius 36px.
3. Radius tokens across sheets and cards. Proof: task sheet and Inbox sheet with 36 top corners; Block card at 20.
4. Spine hold-and-drag + knurl. Proof: mid-drag screenshot and the saved time; a unit test that a vertical drag before 250ms scrolls and never moves a card.
5. Task sheet Time and Length sliders. Proof: screenshot; `habits.test.mjs` green; a test that release writes the snapped value and `aria-valuetext`.
6. Water drag, meal swipe, question swipe and Likely tag. Proof: tests and screenshots.
7. Tab bar slide, Inbox drag-to-Today, Add long-press.

## 8. Critic rubric (0–10 each, from screenshots)

1. Inset and alignment: tab bar, Capture composer, FAB stack, snackbar sit 16dp from the sides and align on one right edge.
2. Concentric corners: tab bar 20 with pill 12; composer 36 with cards 20 and chips 8; sheets 36; cards 20.
3. Border and surface: every float has a visible 1px border in dark mode; no blur, no gradient.
4. Size restraint: body text still 14/16, titles 16/22; tab bar 64 tall; nothing grew.
5. Next task clarity: the next card alone has the primary edge bar and a countdown.
6. Gesture hints visible at rest: knurl, slider thumbs, water track, sheet handle.
7. Choice support: "Likely" choice with preview; free-time picker pre-selects and names the result.
8. Dark and light parity; label contrast on the tab bar at least 4.5:1.

## Orchestrator decisions (override the body)

1. Tab bar radius 20.
2. Capture keeps the v0.30 structure: response cards stack above the composer as before. The owner called the Apple-style "one panel with cards inside" ugly. Only the composer gets the new geometry (16 inset, radius 36, 1px border, no blue focus ring), and cards get radius 20.
3. No double tap to start a task. A tap must open the sheet at once. Add a "Start now" chip in the sheet header instead.
4. Finding from a browser drive: a task dated today with no time does not appear on the Today timeline, and the Inbox row shows a count of 1. Fix this: an untimed task for today must be visible on Today (for example an "Anytime today" group above or below the spine).

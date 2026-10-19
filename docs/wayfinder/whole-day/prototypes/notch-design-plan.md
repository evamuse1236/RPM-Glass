# Notch design plan (fable-designer, verbatim)

Prototype: [notch-options.html](notch-options.html)

## Decisions on the plan's open questions

1. Meal colour token `#F2A93B` is accepted (amber Must stays reserved).
2. Snooze: Direction A keeps "Snooze 15" in the collapsed water pill; B and C put it in the panel — as planned.
3. Camera hole: use y=22dp centre for now; note in the page footer "Camera position is approximate until measured on the S24 FE."

## Design plan (from fable-designer, verbatim)

## Shared (all three)

- Phone mock: 390×844, 12dp camera hole centred at x=195, centre y=22. Pill is centred on the hole and covers it (black on black, as Apple does). Corner radius always = half the height (full pill), expanded panel 28dp (DESIGN sheet radius).
- Colours: pill `#000000` (true black, matches the sensor; never tinted near-black). Text `#FFFFFF`; secondary text `#C4C7C5`; dim ring/track `#333537`. Water `#0B57D0` fill with white text (8.6:1). Routine progress green `#6DD58C` on black. Meal nudge: new token `notch-meal: oklch(0.80 0.15 70)` ≈ `#F2A93B` (Must amber is reserved for the star). Agent toast: inverse surface `#E3E3E3` text `#1F1F1F`, Undo in `#0B57D0`. Expanded panel bg `#1B1B1B`, rows divided by `#333537` hairlines, action buttons `#282A2C` fill, 20dp radius.
- Type: `Google Sans Flex, Roboto Flex, Roboto, system-ui`. Pill text 13sp/16 weight 500, tabular figures; secondary 13sp/400. Expanded: tasks 16sp/24 400, action labels 14sp/20 500, meal slot title 16sp/24 500, chips 14sp/20 500. Nothing under 12sp.
- Icons: Material Symbols Rounded, 18dp in the pill, 22dp in the panel, filled on the alerting state. Glyphs: task `edit_note`, time `schedule`, water `water_drop`, routine `wb_sunny` (Morning), meal `restaurant`, capture `mic`, agent `smart_toy`, tick `check_circle`, undo `undo`, empty circle `radio_button_unchecked`.
- Motion tokens: `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-island: cubic-bezier(0.34,1.25,0.64,1)` (the one overshoot), 150 / 250 / 400ms. Reduced motion: every state change becomes a 150ms opacity crossfade, no size or position change animates.
- Expanded panel content (all directions): 366dp wide (12dp margins), top-anchored, holds a 2×2 action grid (Log a meal, Quick capture, Ask the agent, Snooze water or Routine step; each 48dp tall, icon + label) then three task rows (48dp, tick circle at start, title, "25 min left" / "7:00 PM" in `#C4C7C5` at end). Height ≈ 232dp.
- Meal log sheet (all): replaces the panel content. Title "Lunch" with `restaurant`, subline "Guessed from the time · Change" (text button). Six chips wrapping, 40dp, 8dp radius, outlined `#8E918F`, 1-tap each: Dal rice, Poha, Paneer wrap, Maggi, Thali, Curd rice. Below, a 48dp pill field "Type your own" with Send at its end. Tapping a chip collapses to the toast "Logged Poha for lunch · Undo".
- Agent toast (all): pill grows to 300dp wide, 44dp tall, inverse surface, text "Moved Gym to 7 PM", Undo at the end, 4s then collapses.
- Live Update fallback (all): chip = icon + text ≤ 96dp wide, no colour. Idle "Essay · 25m", water "Water 5/8", routine "Morning 3/5", meal "Lunch?", empty = no chip. Tap opens the app on the notch panel.
- Accessibility: pill is one 48dp-tall tap target even when 32dp visually; focus ring 2dp `#A8C7FA` outline offset 2dp; all alerts carry words, not colour alone.

## A · Quiet ink

Feel: a line of ink that unrolls from behind the camera. Monochrome until something changes; then the whole pill takes the colour.

- Collapsed idle: 32dp tall, width hugs content (≈ 212dp). Camera at the left third; glyph `edit_note` 18dp just right of the hole; text "Write RM essay · 25 min left" in one line, white, the "· 25 min left" in `#C4C7C5`. Padding 14dp inline.
- Empty: nothing drawn. Bare camera.
- Water: pill fills `#0B57D0`, filled `water_drop`, text "Water · 5/8". Two inline 28dp text buttons appear after 300ms: "Drank it" (white on `#0842A0`), "Snooze 15". Width ≈ 300dp, height 36dp.
- Routine: black, `wb_sunny`, "Morning · 3/5"; the "3/5" sits in green `#6DD58C`.
- Meal: black, `restaurant` in `notch-meal`, "Lunch? · Log it".
- Expanded / meal sheet / toast: as shared. Panel is black (`#000000`) in this direction, rows on `#1B1B1B`.
- Motion: expand 400ms `--ease-island` scaling width then height; collapse 250ms `--ease-out`. Signature: text unrolls from the camera outward using `clip-path: inset(0 X 0 0)` over 250ms, like ink being drawn; an alert is a 250ms colour fade, no bounce.
- Fallback: identical to shared; this direction loses almost nothing, since it is already icon + text.
- Trade-off: calmest, most Apple-like, and closest to what Android can actually show; least visual feedback of progress.

## B · Living status

Feel: the camera becomes a dial. A 2dp arc rings the hole and shows progress; the pill is the arc's caption.

- Collapsed idle: 36dp tall, ≈ 232dp wide. Around the camera a 22dp ring: track `#333537`, arc `#FFFFFF` showing time elapsed in the task (25 of 45 min = 44%). Text to the right: "Write RM essay" white, below it (two lines, 12sp/14) "25 min left" `#C4C7C5`. No glyph; the ring is the symbol.
- Empty: ring only, 22dp, track colour, no pill. The one direction that stays visible when idle.
- Water: ring arc turns `#0B57D0` and shows 5/8 (62%), pill fills blue, text "Water 5/8" + "Drank it" button (28dp, white on `#0842A0`). Snooze is in the expanded panel.
- Routine: arc green 3/5 (60%), text "Morning routine" / "3 of 5 steps".
- Meal: arc `notch-meal` full, text "Lunch?" / "6 usual meals".
- Expanded: panel `#1B1B1B`; the ring stays at the top-left with a 48dp caption "25 min left · Write RM essay". Then actions and tasks as shared.
- Motion: expand 400ms `--ease-island`; the arc grows from 0 to its value over 600ms `--ease-out` on every reveal. Signature: on a water alert the blue pours from the ring outward into the pill (a radial `--progress` custom property driving `background: radial-gradient` 400ms). Reduced motion: arc and fill crossfade.
- Fallback: "Water 5/8" chip text; the ring is lost. Chip text carries the fraction so the number survives.
- Trade-off: the most "living", gives him a glance-able count (water, routine) with no reading; needs the accessibility overlay or it collapses to text.

## C · Ticker

Feel: one narrow strip that cycles its next three items, like a departures board, so the pill is never crowded.

- Collapsed idle: 32dp tall, fixed 236dp wide. Glyph at left of the hole, text to the right. Every 6s it rolls to the next item: "Write RM essay · 25 min left" → "Gym · 7:00 PM" → "Water in 40 min". Three 4dp dots under the text (`#444746`, active `#C4C7C5`) mark the position.
- Empty: nothing drawn. The ticker only runs when something is due within the hour.
- Water: cycling stops. Pill blue, "Water · 5/8 · Drank it" where "Drank it" is the inline button; a tap rolls to "Logged · 6/8" then resumes.
- Routine: a card in the cycle: "Morning · 3/5 · Next: shower".
- Meal: a card in the cycle in `notch-meal`: "Lunch? Tap to log".
- Expanded: the three ticker cards become the three task rows, in order, with the ticker's current card highlighted (`#282A2C` row). Actions as shared.
- Motion: roll = old text translates up 16dp and fades, new text comes from below, 250ms `--ease-out`. Expand 400ms `--ease-island`. Signature: the roll itself; a tap mid-roll opens the item currently shown. Reduced motion: no roll, crossfade 150ms, and the cycle interval doubles to 12s.
- Fallback: the Live Update text updates every 6s with the same cycle; dots are lost.
- Trade-off: shows the most information in the smallest pill; constant movement at the top of the screen can be a distraction for ADHD, so he should feel it on the mock before choosing.

## Recommendation

Try A first. It is the one Android can honour on both paths (overlay and Live Update), its states are the clearest to tick off one by one, and it leaves room to add B's ring later as a single feature. Build B second if he misses seeing a count at a glance. Leave C for the mock only; decide after watching it move for a minute.

## Gallery page `notch-options.html`

- Background `#F0F4F9`, page title "Notch: three directions" (28px/36 400), one line under it: "Same state on all three. Pick the one you want to try first."
- Sticky state switcher directly under the title: one row of 8 full-pill chips (Idle, Empty, Water, Routine, Meal, Expanded, Meal log, Agent toast), selected = `#C2E7FF` on `#001D35`, 40dp tall. One switcher drives all three phones at once, so he compares like with like.
- Below: three columns on wide screens (`grid-template-columns: repeat(auto-fit, minmax(390px, 1fr))`, gap 32px), stacking to one column under ~1240px. Each column: a header card with the letter and name ("A · Quiet ink"), the one-line trade-off in `#444746`, then the 390×844 phone (reuse the frame and lavender lock screen from the approved capture image, status bar 9:41), then under the phone two buttons: a filled "Play signature moment" (`#0B57D0`, white) and an outlined "Show fallback chip" that swaps the pill for the Live Update status-bar chip.
- Under each phone, one caption in 14px `#444746` naming the current state and its exact pill size ("Idle · 212×32dp").
- Keyboard: left/right arrows change state; 1/2/3 play each direction's moment. Honour `prefers-reduced-motion` on the page too.

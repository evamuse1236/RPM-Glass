# Notch redesign plan

Design plan by fable-designer, 2026-10-19, from `docs/notch-design-study.md`. Builds on `feat/notch-in-place` (receipts with Undo, alert rows).

**Direction.** The notch is an instrument, not a card: black, one tinted ring, two text sizes, one button. The ring is the same object in all four states.

## Tokens (dp / sp)

- Ink black. Text white 100% (titles), 70% (lines), 60% (meta).
- Accents on black: task `#A8C7FA` (replaces `#0B57D0`, which fails 3:1 on black), event `#C4C7C5`, water `#7CACF8`, habit `#6DD58C`, meal `#FDD663`, alarm `#F2B8B5`, reminder white 87%.
- Ring track white 18%. Pressed fill white 12%.
- System sans. Value 15/600 (pill), 22/600 (island trailing); title 17/600; line 14/400; row title 15/400; row value 14/500; button 15/600. Numbers tabular.
- Spacing 4/8/12/16. `h` = pill height (status bar, about 36dp).

## 0. Geometry (user, 2026-10-19: "pay special attention to corner radii and arrangement, its not symmtrical above and below")

This section wins over any size below it.

- Every open, alert and receipt island: radius **36dp**, padding **16dp on all four sides**. The space above the first element equals the space below the last.
- Concentric rule: an inner shape's radius = 36 − its inset. At the 16dp inset that is 20dp: the leading circle (40dp), the alarm Stop (40dp), Undo and every button (40dp tall, radius 20).
- Rows sit in a −8dp outer margin so their pressed shape reaches 8dp from the edge. Rows are 44dp tall and fully round (22).
- Band: leading circle at (16, 16), trailing element right-aligned at 16dp, all centred on the band's middle line. Gap band → title 12dp; title → controls 16dp; between rows 0.
- Two controls (alert islands): two equal pills side by side, 8dp gap, the primary first and filled with its accent at 30% into black; the secondary is white 8%. One control (open island): one full-width pill.
- Every 40dp control has a 48dp touch area.
- Pill: height 36, radius 18, ring 28 inset 4 (18 − 4 = 14 = the ring's radius).
- Reference mock: `docs/mocks/notch-redesign.html`.

## 1. States

**Pill (compact).** Min width 112dp (was 140). Leading: ring 28dp, inset `(h−28)/2`. Trailing: value, padding 8 start / 14 end. Keep-gap over camera = hole + 12. Values: running "45m"; upcoming "2:27" (AM/PM only when more than 12 h away); water "3/8" in water blue; habit "2/5" in green. Task value white.

**Pill + split circle (minimal).** Circle diameter `h`, 8dp gap, start side. Holds the second kind's 28dp ring and glyph, no text.

**Open island (expanded).** Inset 12, radius 32, padding 16, inner radius 16. Top band is `h` tall, beside the camera: leading ring 36dp; trailing value 22/600, tinted by kind. Below: title (≤2 lines), line in accent, one primary control, then up to 3 rows (44dp, 48dp tap box): next item, water (dots, "3/8", "+"; the whole row logs a glass), meal ("Log"; the row logs the meal). Reminder/alarm rows: time chip plus a 40dp Done circle; row tap opens the manage face. Manage face: one primary (Turn off), rows "Make it a reminder/alarm", "Done", "Open".

**Alert island.** Inset 12, radius 28, padding 16, inner radius 12. Band: leading 36dp circle (bell or clock); trailing the trigger. Reminder: time 17/600 white. Alarm: Stop, 44dp circle `#F2B8B5` with a 14dp square `#601410`. Below: title 17/600, line 14/400 ("Reminder · 5:30 PM" white 70%; "Ringing · 2:48 AM" alarm tint). Controls: Done (primary) + "Snooze 10 min" text. Tap on the words opens the item. A reminder never shows a clock glyph or the words alarm or ringing.

## 2. Ring

28dp (pill, split) / 36dp (island). Stroke 2.5 / 3. Track white 18%, fill = accent, from 12 o'clock clockwise, round caps. Glyph 14 / 18dp. Progress: running task or event = elapsed ÷ duration; upcoming = 0; water = glasses ÷ goal; routine = steps done ÷ total; meal = 1 when logged. Reminder and alarm circles have no ring (white 12% / alarm 24% fill).

## 3. Controls

One primary per hero, a 48dp pill: fill = accent 20% into black, label and glyph in the accent. Task/event: Done (hidden for a fixed event, never greyed). Water: Glass. Routine: Done step. Secondary: at most one text button (Later for water or routine). Long press opens the hero in the planner. The island always offers Glass, as the primary or as the water row.

**Receipt with Undo** replaces the band in place: the ring animates from→to, the trailing slot holds "Undo", and "Glass logged / 4 of 8 today" (16/600, 13/400) sits below. Height `h + 8 + 40 + 16`, radius 28. Holds 4 s, then morphs back.

## 4. Motion

Open 350ms `cubic-bezier(0.2,0,0,1)`; ring (28→36) and value (15→22sp) travel on the same curve; the rest fades in 90–300ms and rises 8dp. Close 300ms. The split circle slides into the island's leading slot. Rolling digits: only changed digits move, old out upward 0–150ms, new in from below 100–250ms. Ring fill 400ms `cubic-bezier(0.05,0.7,0.1,1)`. Reduce Motion: size snaps, faces and digits cross-fade 150ms, ring snaps. Nothing over 400ms.

## 5. Large and max text

sp scales; dp does not. Pill value caps at `h − 12`dp tall; min width grows with the value. Island: title wraps whole words up to 3 lines (large) / 4 (max); trailing value stays one line and drops AM/PM first. At large the text button drops under the primary; at max the primary spans the width. Rows drop 3→2→1 before any text is cut. Island height caps at 60% of the screen. Alarm Stop stays in the band. No word is split.

## 6. Tests

`NotchSceneTest`: pillValueDropsAmPmWithinTwelveHours, ringProgressPerKind, heroHasOnePrimaryControlNeverDisabled, islandAlwaysOffersGlass. `IslandShapeTest`: innerRadiusIsOuterMinusPadding, pillMinWidthIs112. `NotchFrameTest`: bandBesideCameraHoldsRingAndValue, sharedRingAndValueTravelOnOpen, reducedMotionFadesInsteadOfMoves, rollingDigitsMoveOnlyChangedDigits, reminderNeverSaysAlarm, receiptReplacesBandAndKeepsRows. `rpmctl scenario max-text-reflow` with the notch open, alert and receipt.

## Decisions on the plan's open questions

Taken with the recommended default; the user can overturn them.

- (a) Task accent `#A8C7FA` replaces `#0B57D0` on the notch only (contrast on black).
- (b) The meal row logs the planned meal directly, with a receipt and Undo.
- (c) An upcoming task's ring stays empty. A countdown fill over the last 60 min is untested.

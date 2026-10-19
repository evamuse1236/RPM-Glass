---
name: RPM
description: Apple-style grouped surfaces (iOS Settings, Reminders, Calendar) drawn with the app's own font and icons, one theme for the planner, Capture and the weekly review.
source: android-companion/theme.css
plan: docs/app-redesign-plan.md
colors:
  bg: "light oklch(96% 0.005 285) / dark oklch(0% 0 none)"
  bg-elevated: "light oklch(100% 0 none) / dark oklch(22% 0.003 285)"
  cell: "light oklch(100% 0 none) / dark oklch(22% 0.003 285)"
  cell-elevated: "light oklch(96% 0.005 285) / dark oklch(30% 0.003 285)"
  fill: "light black 8% / dark white 12%"
  label: "light black / dark white"
  label-2: "light oklch(35% 0.01 285 / .75) / dark white 60%"
  label-3: "light oklch(35% 0.01 285 / .3) / dark white 30%"
  separator: "light oklch(35% 0.01 285 / .29) / dark oklch(60% 0.01 285 / .65)"
  tint: "light oklch(47% 0.19 262) / dark oklch(82% 0.08 262)"
  success: "light oklch(45% 0.13 150) / dark oklch(80% 0.15 150)"
  must: "light oklch(55% 0.14 60) / dark oklch(88% 0.14 90)"
  danger: "light oklch(50% 0.18 27) / dark oklch(82% 0.07 20)"
typography:
  font: "Google Sans Flex, Google Sans, Roboto, system-ui, sans-serif"
  large-title: {fontSize: "34px", fontWeight: 600, lineHeight: "41px"}
  title-1: {fontSize: "28px", fontWeight: 600, lineHeight: "34px"}
  title-2: {fontSize: "22px", fontWeight: 600, lineHeight: "28px"}
  title-3: {fontSize: "20px", fontWeight: 500, lineHeight: "25px"}
  headline: {fontSize: "17px", fontWeight: 600, lineHeight: "22px"}
  body: {fontSize: "17px", fontWeight: 400, lineHeight: "22px"}
  callout: {fontSize: "16px", fontWeight: 400, lineHeight: "21px"}
  subhead: {fontSize: "15px", fontWeight: 400, lineHeight: "20px"}
  footnote: {fontSize: "13px", fontWeight: 400, lineHeight: "18px"}
  caption: {fontSize: "12px", fontWeight: 400, lineHeight: "16px"}
icons: "Material Symbols Rounded, 24dp, outlined by default and filled for selected or set states"
rounded: {sheet: "36px", group: "20px", control: "12px", tile: "8px", pill: "999px"}
spacing: {s1: "4px", s2: "8px", s3: "12px", s4: "16px", s5: "20px", s6: "24px", s8: "32px", page-inset: "16px", touch: "48px", top-bar: "56px", nav: "64px", fab: "56px"}
---

# Design System: RPM

## Overview

RPM looks like an Apple app drawn with its own font and icons: grouped cells on a gray page, large titles that hand off to a centred bar title, a tinted accent and a calm palette where colour means something. The reference set is iOS Settings (grouped rows), Reminders (task rows) and Calendar (the day). The full plan is [docs/app-redesign-plan.md](docs/app-redesign-plan.md); the M3 role names in `theme.css` are aliases kept for one release.

The RPM chain stays visible where the user acts. A task serves a Result, the Result has a Purpose, and its ordered tasks form the Plan. Today's lead card puts the next task under its Result and Purpose, and the weekly review is the main planning ritual.

Everything is built from one file, [android-companion/theme.css](android-companion/theme.css). It defines the colour roles, type scale, shape, spacing, elevation and motion tokens. `planner.css`, `capture.css` and `review.css` use those tokens and never introduce their own palette.

## Colour

- Each colour token holds its light and dark value with `light-dark()`. Light and dark follow the system, or Settings pins one through `data-appearance="light|dark"` on `<html>`.
- **Page and cells:** `--bg` is the page; lists and cards sit on it as `--cell` groups. Sheets are `--bg-elevated`, and groups inside a sheet use `--cell-elevated`.
- **Labels:** `--label`, `--label-2` for supporting text (4.5:1 on its cell) and `--label-3` for placeholders. `--separator` draws hairlines inset to the text edge.
- **Tint** marks the main action, links, the current tab and selection (`--tint-soft` behind a selected chip).
- **Success** (green) is an achieved Result and a switch that is on. **Must** (amber) is only the Must star. **Danger** is for overdue text, destructive actions and failures, and always comes with words.
- **Area hues** (`--area-0` to `--area-7`) are the only decorative colour. An Area hue always appears next to the Area name, and `Area.colorIndex` keeps the same hue in both themes.

## Typography

Google Sans Flex is bundled (OFL, latin subset), with an Apple-style scale as `font:` shorthand tokens. Root pages open with a `--large-title` that scrolls away and hands off to a `--headline` bar title; detail titles use `--title-1`, sheet titles `--title-3`, Result titles `--headline`, task names `--body`, and metadata `--footnote` or `--subhead` in `--label-2`. Section headers are `--footnote` above their group. Times and durations use tabular figures (`.tnum`). Nothing is smaller than `--caption` (12/16).

Design for the user's S24 FE at One UI default text: 384dp wide, 100% font scale. Enlarged text is not a target. Nothing has a fixed text height, so a long title still wraps rather than clipping.

## Icons

Material Symbols Rounded is bundled as a ligature font: `<span class="ms">add</span>`, with `.ms.fill` for selected and set states (the active navigation icon, a set Must star). Every icon button has a 48dp touch target and an accessible label.

## Layout

- **Planner:** a 56dp bar with the page's large title in the content below it; the centred bar title fades in over the last 24dp of the large title's travel, and a hairline appears once the page scrolls. Detail screens have a tint Back chevron with the previous page's name. Below the page is a 64dp tab bar with four destinations (Today, Blocks, Projects, Life), each an icon and caption, the current one in the tint. Every root tab has a right-hand column above the tab bar, in the right thumb's reach: a 40dp Search pill over the 56dp tint Add circle (Add task on Today, New Block or New Project elsewhere). Both step aside together while the page scrolls down and return on the way back up; they press to 97% and spring back. On today's spine the Now pill sits centred on the Add button's line. The top bar keeps Capture and More options. Detail screens have none, so nothing floats over a Plan row's Must star: Block detail adds from the inline field under its Plan. Pages use 16dp side margins and stop at 720dp wide.
- Detail screens (Block, Project, Goal, Area), Settings, Search and the weekly review are pushed above the four destinations and honour Android Back. The navigation bar is hidden on Settings, Search and the review.
- **Today:** under the date, a strip of the next seven days starting today (swiping steps a week) marks days holding Results' deadlines with an hourglass (and their count when more than one), days with a calendar clash with the clash mark in the error colour, and other days with tasks with a dot; tapping a day lists that day's deadlines and clash above its agenda. Under the strip, one quiet line says where the week's plan stands and opens the weekly review: this week's Results (only Results the user marked achieved count), or from Friday to Sunday "Week of Oct 5 isn't planned · review 7:30 PM" (the user's own timed "Weekly review" task today, which stays in the agenda at its time). Then one lead card for now, the screen's only filled button. When there is half an hour or more free before the next timed task or busy event, it is **Free 8:00 – 10:00 AM · in 1 h** (or "Free until 10:00 AM" once the gap has started): the nearest deadline (overdue first, then due by the end of the day after tomorrow) whose unscheduled tasks fit, as the header, those tasks, and "Schedule at 8:00 AM", which schedules them back to back into the gap with Undo. Otherwise it is **Do next**: a primary "Do next · in 4 h" label (or "Now · 20 min left"), the Result as a short header (title-medium, then its Purpose on its own quieter line, then one facts line: "Due tomorrow 11:00 PM · in 40 h · 5 tasks left"), then the task itself. With large text the title and Purpose wrap in full and the facts keep the deadline; the countdown, the task count, the free card's task durations and the strip give way so the first row below stays in view, and the week line moves under Coming up. **Coming up · Next 3 days** follows: every other Result due in the next three days and every calendar clash, soonest first, as plain list rows with a neutral leading icon, the headline on its own full-width line, then the supporting lines beside at most one trailing text button. A Result row says "Due tomorrow 11:59 PM · in 41 h" (the one deadline format on Today) over "2 tasks left"; one due by the end of the day after tomorrow with nothing planned before its deadline adds "not scheduled yet" and Add to today (dates its first undated task, with Undo). An overdue Result says so in the error colour. A clash (overlapping events, or a timed task and an event, in the next three days; overlaps join into one row) has "Clash · Mon 9 – 11 AM" with Resolve beside it and one line per item with its time span; a task says "can move", and the task that sets a Result's deadline shows "Due 10:30 AM" in place of its span. Resolve opens a sheet listing the overlapping items, where a task can move to just before the clash or open to change its time, both with Undo (never the deadline task in one tap), and a clash of calendar events only offers one task today to sort it out. The error colour is only for a clash or an overdue Result. Then **Later today**: one time-ordered agenda, as Calendar's schedule, with tasks (their Result on a third line) and calendar events (a tonal fixed block whose text lines up with the task titles) interleaved, the free time between them as one quiet line on a dotted rail ("2 h 30 min free"), and tasks with no time last. The Inbox row with its count ends the page. Every row's text starts at the same 56dp edge. The Timeline is a secondary view of the same day.
- **Weekly review:** a full-height route with a close button, a 4-segment progress bar, a scrolling body and a pinned footer (Back and one filled Next). See the flow below.
- **Capture:** one floating `--bar` panel over whatever app is open, with 36dp corners, a 36×5 grabber and a shadow, 4dp from the screen edges, growing upward above the keyboard. Cards sit inside it at 16dp with 20dp corners on `--bar-high`; the composer is one 20dp-corner field at the same inset with + and the mic inside it. Expand fills the available height.

Content never nests more than one card level.

## Shape and elevation

Corners nest: an inner radius is the outer radius minus the inset. Sheets and the Capture panel use 36dp (`--r-sheet`), groups and cards 20dp (`--r-group`), fields and menus 12dp (`--r-control`) and tiles 8dp (`--r-tile`); buttons, chips and the segmented control are pills. `radius-tokens.test.mjs` checks the scale, the Capture nesting, and that every corner of 6px or more uses a token. Only floating things cast a shadow (`--shadow-float`): sheets, the Capture panel, menus, the snackbar and the FABs. Groups and cards are flat.

## Motion

Motion uses the M3 tokens (emphasized, emphasized decelerate/accelerate, standard; 50–400ms), kept in `theme.css` and mirrored in `surface-motion.mjs`. It is short, interruptible (every move starts from the pose on screen, and taps go through mid-transition) and one motion per change:
- **Sheets** rise from the bottom edge (emphasized decelerate, 350ms) and leave by sliding down (emphasized accelerate, 200ms); one scrim whose opacity follows the sheet's travel (same curve and duration both ways), so it clears only as the sheet's last edge leaves. A sheet opened over a sheet replaces its content in place, as one container motion: the height morphs from the first frame on the content's 300ms emphasized curve (no tall empty slab) while the old content fades out by 90ms as it starts to slide and the new content slides the rest of the way in and fades in (90–300ms; `openSheet(…, {motion: 'back'})` reverses it), with no second entrance and no movement while the old words are still on it. The handle (and the header's empty space) drags the sheet 1:1 with the finger; let go past 30% of its height or faster than 0.8 px/ms and it leaves in 150ms, otherwise it settles back in 200ms (emphasized decelerate). Native predictive back can drive it (`rpmBackProgress`/`rpmBackCancel`).
- **Saving** rebuilds the screen off-document and reconciles it in by key: unchanged rows stay the very same nodes (their running animations and focus survive), rows that stay slide to their new place, a kept row or container that changes height grows or shrinks to it (250ms) while the rows below follow, a small new element fades in (150ms), a removed row collapses where it was, a new row opens from zero height, a row whose words change in place fades through (old out by 90ms, new in over 150ms) and a card replaced as a whole (Today's lead) fades through while its height morphs, and scroll and focus hold. Rows are keyed by what they are (Coming up rows by Result or clash, free time by what it follows, so when the item after a gap leaves, that gap stays put and its words fade through while the item and the gap after it close). The first row wholly on screen holds the reading position; changes above it (a row cut off by the top edge included) happen at once, and a page scrolled to its end keeps the length that takes. Scrolled to the end, the page keeps its length while a row leaves, so what is above stays still and the rows below close the gap; the spare space goes as the user scrolls back up. While a sheet is open the page behind it changes at once (nothing moves under the scrim, the first row on screen stays put); when the sheet closes, the changed rows slide from where the user last saw them.
- **Navigation:** push and pop use shared axis X (30dp, 300ms, reversed on Back) with the top bar moving with its page; day to day too. Opening and closing the weekly review is a step down in hierarchy and uses shared axis Y; the navigation bar leaves and returns with Today. Navigation bar tabs fade through (the incoming grows from 92%). Both follow M3's sequence: both layers move from the first frame, the outgoing fades out over 0–90ms and the incoming fades in over 90–300ms, so the two screens are never seen on top of each other. The FAB belongs to its page: it rides the page's own transition (the same layers and motion), with no fade or scale of its own. Weekly review steps use shared axis X with only the step body moving; the top bar, progress and footer stay the same nodes and switch their words at the 90ms crossover with the body (Back fades in over 150ms on step 2), and changes inside a step never replay it.
- **Completing a task:** the ring pops and the title strikes through (150ms) and the struck row holds for 300ms so "done" can be read; then one re-render by key does everything in one beat: the row collapses where it is (250ms, its words fading with its space), Completed opens, and the lead card, Coming up and free time change with it (a row whose slot another takes, even one cut off by the top edge, fades through: old out by 90ms, new in over 90–240ms), so the net shift is one motion and all is still by about 600ms. The pop plays once. Undo reopens it in place.
- **Snackbar** enters as one piece: the bar and its words together (the words are in it at full strength from its first visible frame), fading in as it rises 12dp and grows from 96% (150ms emphasized decelerate), and it always leaves downward (150ms); the FAB moves with it on the same timing. The same message again leaves the bar still and restarts its time. A new message keeps the one opaque bar and swaps the words as a vertical ticker: the old slide up and fade out over 0–90ms, then the new slide in from below over 90–240ms, never both legible. A message raised while a sheet is leaving waits until the sheet is gone. It stays 6s with Undo (4s without) and its timer pauses while a text field has focus. Menus open from their anchor (150ms scale, the surface opaque within 50ms); the overflow menu fades out (100ms, accelerating) and the schedule choices stay opaque as they fold toward their anchor, fading only in their last 50ms.
- **Week strip:** the selected day is a ring that slides to the new day (250ms emphasized) while the day's head stays still and the content below fades through; a swipe steps a week; a long press on a day opens that day's tasks in a sheet with Open day.
Motion tokens live in `theme.css`, mirrored in `motion-core.mjs` and checked by `motion-tokens.test.mjs`: the M3 emphasized and standard curves, plus `--ease-spring` (cubic-bezier(.34,1.56,.64,1), only for a scale of at most 1.1), `--dur-press` 100ms, `--dur-settle` 200ms and `--dur-morph` 350ms.
Reduced motion (the system setting or Android's Remove animations) removes movement: changes are instant (see the end of `theme.css`).

## Components

Moved to [docs/design/components.md](docs/design/components.md) to keep each file small.

## Do

- Use only theme.css roles and tokens. If a new value is genuinely needed, add a token there.
- Keep the vocabulary exact: Area, Goal, Project, Block, Result, Purpose, Plan, Task, Must, No block, Inbox.
- Show Result and Purpose wherever a task is acted on.
- Keep 48dp targets, Android Back closing the topmost layer first, default-text fit and reduced motion.

## Don't

- Don't add glass, blur, gradients or aurora light. Those belonged to the old Capture and are gone.
- Don't use colour alone to carry meaning, nest cards or add a fifth navigation destination.
- Don't write Capture proposals into the Plan without a confirmation tap, or treat finished tasks as an achieved Result.

## Not yet redesigned

The butterfly launcher and the desktop browser prototype keep their older styles until they are redesigned.

## Home-screen widget

The widget is a RemoteViews bar, so it uses native resources instead of theme.css. `res/values/colors.xml` and `res/values-night/colors.xml` mirror the theme.css roles as `rpm_*` colours; change both files together. The bar is `surface-container` with the launcher's widget corner radius on Android 12+ (28dp before). From the start: the app icon (32dp in a 48dp target, M3 pressed state) opens the planner; then a 48dp full pill in `surface-container-highest` reads "Capture a thought" (16sp, `on-surface-variant`, one line) and holds, at its end, a 40dp round mic button in `primary-container`. The pill opens Capture ready to type; the mic opens it listening. Custom fonts are not available in RemoteViews, so the widget uses the system sans-serif.

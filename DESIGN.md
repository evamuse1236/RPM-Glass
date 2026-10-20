---
name: RPM
description: Material 3 in the style of Google's own apps (Tasks, Calendar, Keep, Gmail), one theme for the planner, Capture and the weekly review.
source: android-companion/theme.css
colors:
  light-primary: "#0B57D0"
  light-on-primary: "#FFFFFF"
  light-primary-container: "#D3E3FD"
  light-on-primary-container: "#041E49"
  light-secondary-container: "#C2E7FF"
  light-on-secondary-container: "#001D35"
  light-tertiary: "#146C2E"
  light-tertiary-container: "#C4EED0"
  light-error: "#B3261E"
  light-surface: "#FFFFFF"
  light-on-surface: "#1F1F1F"
  light-on-surface-variant: "#444746"
  light-surface-container-low: "#F8FAFD"
  light-surface-container: "#F0F4F9"
  light-surface-container-high: "#E9EEF6"
  light-surface-container-highest: "#DDE3EA"
  light-outline: "#747775"
  light-outline-variant: "#C4C7C5"
  light-must: "#B06000"
  dark-primary: "#A8C7FA"
  dark-on-primary: "#062E6F"
  dark-primary-container: "#0842A0"
  dark-on-primary-container: "#D3E3FD"
  dark-secondary-container: "#004A77"
  dark-on-secondary-container: "#C2E7FF"
  dark-tertiary: "#6DD58C"
  dark-tertiary-container: "#0F5223"
  dark-error: "#F2B8B5"
  dark-surface: "#131314"
  dark-on-surface: "#E3E3E3"
  dark-on-surface-variant: "#C4C7C5"
  dark-surface-container-low: "#1B1B1B"
  dark-surface-container: "#1E1F20"
  dark-surface-container-high: "#282A2C"
  dark-surface-container-highest: "#333537"
  dark-outline: "#8E918F"
  dark-outline-variant: "#444746"
  dark-must: "#FDD663"
typography:
  font: "Google Sans Flex, Google Sans, Roboto, system-ui, sans-serif"
  headline-medium: {fontSize: "28px", fontWeight: 400, lineHeight: "36px"}
  headline-small: {fontSize: "24px", fontWeight: 400, lineHeight: "32px"}
  title-large: {fontSize: "22px", fontWeight: 400, lineHeight: "28px"}
  title-medium: {fontSize: "16px", fontWeight: 500, lineHeight: "24px"}
  title-small: {fontSize: "14px", fontWeight: 500, lineHeight: "20px"}
  body-large: {fontSize: "16px", fontWeight: 400, lineHeight: "24px"}
  body-medium: {fontSize: "14px", fontWeight: 400, lineHeight: "20px"}
  label-large: {fontSize: "14px", fontWeight: 500, lineHeight: "20px"}
  label-medium: {fontSize: "12px", fontWeight: 500, lineHeight: "16px"}
icons: "Material Symbols Rounded, 24dp, outlined by default and filled for selected or set states"
rounded: {xs: "4px", sm: "8px", md: "12px", lg: "16px", card: "20px", xl: "28px", outer: "36px", full: "999px"}
spacing: {s1: "4px", s2: "8px", s3: "12px", s4: "16px", s6: "24px", s8: "32px", touch: "48px", top-bar: "64px", nav: "80px (64 bar + 16 gap)", inset-page: "16px"}
---

# Design System: RPM

## Overview

RPM looks and behaves like one of Google's own Material 3 apps. The reference set is Google Tasks (task rows, Must stars), Calendar (Timeline, day chips), Keep (tonal cards) and Gmail (top bar, navigation, snackbars), including how those apps look on iPhone: generous white space, large rounded containers and a calm palette where colour means something.

The RPM chain stays visible where the user acts. A task serves a Result, the Result has a Purpose, and its ordered tasks form the Plan. Today's lead card puts the next task under its Result and Purpose, and the weekly review is the main planning ritual.

Everything is built from one file, [android-companion/theme.css](android-companion/theme.css). It defines the colour roles, type scale, shape, spacing, elevation and motion tokens. `planner.css`, `capture.css` and `review.css` use those tokens and never introduce their own palette.

## Colour

- The theme is the GM3 Google blue baseline. Light and dark follow the system, or Settings pins one through `data-appearance="light|dark"` on `<html>`.
- **Primary** marks the main action on a screen, focus and links (and Today's "Do next" label). **Primary container** is used for the tab bar's Add (`secondary-container` in dark).
- **Secondary container** marks selection: the navigation pill, selected chips and segmented buttons.
- **Tertiary** (green) means success: an achieved Result and the celebrate banner (in the weekly review, the Wins card; the Achieved option itself is selected like any other).
- **Must** (amber, as in Google Tasks) is only used for the Must star.
- **Error** is for overdue text, destructive actions and failures, and always comes with words.
- **Surfaces** step from `surface` (the page) through `surface-container-low` to `surface-container-highest`. Depth comes from these tones, not from shadows.
- **Area hues** (`--area-0` to `--area-7`, Google palette) are the only decorative colour. An Area hue always appears next to the Area name, and `Area.colorIndex` keeps the same hue in both themes.

## Typography

Google Sans Flex is bundled (OFL, latin subset), with the M3 type scale as `font:` shorthand tokens (`--title-medium`, `--body-large` and so on). Page titles use headline-medium and detail titles headline-small (title-large once collapsed into the top bar), Result titles use title-medium, task names use body-large, and metadata uses body-medium on `on-surface-variant`. Times and durations use tabular figures (`.tnum`). Nothing is smaller than label-small (11/16).

Design for the user's S24 FE at One UI default text: 384dp wide, 100% font scale. Enlarged text is not a target. Nothing has a fixed text height, so a long title still wraps rather than clipping.

## Icons

Material Symbols Rounded is bundled as a ligature font: `<span class="ms">add</span>`, with `.ms.fill` for selected and set states (the active navigation icon, a set Must star). Every icon button has a 48dp touch target and an accessible label.

## Layout

- **Planner:** a 64dp top app bar with a large page title that collapses into the bar on scroll. On detail screens the bar shows the title only once the large title has scrolled fully out, so only one title is ever legible. At the bottom floats a 64dp tab bar, 16dp in from both sides and from the bottom edge (more where the system's gesture area needs it), with 20dp corners, a 1px border and the float surface (`surface-container` with a soft shadow in light, `surface-container-high` with no shadow in dark). It holds four destinations (Today, Blocks, Projects, Life), each a 24dp icon over a label-medium label; one 48 × 64 pill with 12dp corners in `secondary-container` sits behind the current one and slides between tabs (250ms emphasized; reduced motion jumps). A sideways drag along the bar carries the pill under the finger (60ms follow, a tick at each tab) and opens the tab it is let go on; a tap on a tab does the same in one step. Pages scroll under the bar and end 16dp above it. The strip between the bar and the screen's edge shows nothing: the page is masked out there. Nothing floats beside the bar, so nothing covers a row's trailing control. On every root tab the bar ends with Add, inside it like a composer's send button: 48 × 48 with 12dp corners (concentric with the bar's 20 and its 8dp inset), `primary-container` in light and `secondary-container` in dark so it sits with the active pill, no shadow (Add task on Today, New Block or New Project elsewhere; none on Values or detail screens, where the four tabs take the full width). Held for 400ms, Add opens Capture instead (a `hold` haptic); the tap still adds. On today's spine, while now is out of view, a 32dp Now pill floats 16dp above the bar, centred; it steps aside while the page scrolls down or a snackbar shows. The top bar holds Search, Capture and More options. While a snackbar shows, pages end above it too, and a row scrolled into view stops 16dp above it. Pages use 16dp side margins and stop at 720dp wide.
- Detail screens (Block, Project, Goal, Area), Settings, Search and the weekly review are pushed above the four destinations and honour Android Back. The navigation bar is hidden on Settings, Search and the review.
- **Today:** under the date, a strip of the next seven days starting today (swiping steps a week) marks days holding Results' deadlines with an hourglass (and their count when more than one), days with a calendar clash with the clash mark in the error colour, and other days with tasks with a dot; tapping a day lists that day's deadlines and clash above its agenda. Under the strip, one quiet line says where the week's plan stands and opens the weekly review: this week's Results (only Results the user marked achieved count), or from Friday to Sunday "Week of Oct 5 isn't planned · review 7:30 PM" (the user's own timed "Weekly review" task today, which stays in the agenda at its time). Then one lead card for now, the screen's only filled button. When there is half an hour or more free before the next timed task or busy event, it is **Free 8:00 – 10:00 AM · in 1 h** (or "Free until 10:00 AM" once the gap has started): the nearest deadline (overdue first, then due by the end of the day after tomorrow) whose unscheduled tasks fit, as the header, those tasks, and "Schedule at 8:00 AM", which schedules them back to back into the gap with Undo. Otherwise it is **Do next**: a primary "Do next · in 4 h" label (or "Now · 20 min left"), the Result as a short header (title-medium, then its Purpose on its own quieter line, then one facts line: "Due tomorrow 11:00 PM · in 40 h · 5 tasks left"), then the task itself. With large text the title and Purpose wrap in full and the facts keep the deadline; the countdown, the task count, the free card's task durations and the strip give way so the first row below stays in view, and the week line moves under Coming up. **Coming up · Next 3 days** follows: every other Result due in the next three days and every calendar clash, soonest first, as plain list rows with a neutral leading icon, the headline on its own full-width line, then the supporting lines beside at most one trailing text button. A Result row says "Due tomorrow 11:59 PM · in 41 h" (the one deadline format on Today) over "2 tasks left"; one due by the end of the day after tomorrow with nothing planned before its deadline adds "not scheduled yet" and Add to today (dates its first undated task, with Undo). An overdue Result says so in the error colour. A clash (overlapping events, or a timed task and an event, in the next three days; overlaps join into one row) has "Clash · Mon 9 – 11 AM" with Resolve beside it and one line per item with its time span; a task says "can move", and the task that sets a Result's deadline shows "Due 10:30 AM" in place of its span. Resolve opens a sheet listing the overlapping items, where a task can move to just before the clash or open to change its time, both with Undo (never the deadline task in one tap), and a clash of calendar events only offers one task today to sort it out. The error colour is only for a clash or an overdue Result. Then **Later today**: one time-ordered agenda, as Calendar's schedule, with tasks (their Result on a third line) and calendar events (a tonal fixed block whose text lines up with the task titles) interleaved, the free time between them as one quiet line on a dotted rail ("2 h 30 min free"), and tasks with no time last. The Inbox row with its count ends the page. Every row's text starts at the same 56dp edge. The Timeline is a secondary view of the same day.
- **Weekly review:** a full-height route with a close button, a 4-segment progress bar, a scrolling body and a pinned footer (Back and one filled Next). See the flow below.
- **Capture:** a dark composer floating over whatever app is open, dark in both themes. It sits 16dp from the sides and 16dp above the keyboard or the screen's bottom edge, with 36dp corners, a 1px `--bar-outline` border, `--bar-shadow` and a 32 × 4 handle (a 48dp grab strip). The field is body-large (16/24) with 12 20 4 padding, at every text size; it has no outline or focus ring and grows to six lines before it scrolls. Under it a controls row (48dp targets, 6dp below) holds + at the start and, at the end, a 40dp round mic (in a 48dp target) that cross-fades to a 40dp Send once there is text (150ms). Send is the one lit control: `--bar-primary` (#A8C7FA) with a `--bar-on-primary` (#062E6F) arrow in both themes. At rest the composer is 108dp tall. Round buttons press to 96%. While listening the mic fills with `--bar-accent` and a 2dp `--bar-primary` ring breathes around it. Response cards stack 8dp above the composer as separate cards with a 1px `--bar-outline` border, 20dp corners and a short shadow, so card and composer read as one concentric stack. Chips have 8dp corners and lead with an 18px icon: on a field question the kind of value (schedule, timer, target), on "Which one?" what choosing does (delete, check_circle); the first "Which one?" chip, which a right swipe picks, has a primary outline and a filled icon. Expand fills the available height.

Content never nests more than one card level.

## Shape and elevation

Cards (Block and Project cards, Today's spine cards) use 20dp corners (`--card-radius` = `--r-group`). Bottom sheets use 36dp top corners (`--r-outer`) with a 1px float border, as does the Capture composer; dialogs keep 28dp, inputs 4dp (outlined fields), and chips 8dp. Buttons, the navigation pill and segmented buttons are full pills. Only floating things cast shadows: the tab bar, the Capture panel, menus and the snackbar (`--float-shadow` for the tab bar and snackbar; `--elev-1`, `--elev-3` elsewhere). In dark mode floats drop the shadow and keep a 1px `outline-variant` border. Floating corners are concentric (`--r-outer` 36, `--r-group` 20, `--r-control` 12, `--r-tile` 8): an inner corner is its parent's minus the inset, so the tab bar's 20 holds a 12dp pill 8dp in, and the snackbar is 12. Resting cards are flat and tonal.

## Motion

Motion uses the M3 tokens (emphasized, emphasized decelerate/accelerate, standard; 50–400ms), kept in `theme.css` and mirrored in `surface-motion.mjs`. It is short, interruptible (every move starts from the pose on screen, and taps go through mid-transition) and one motion per change:
- **Sheets** rise from the bottom edge (emphasized decelerate, 350ms) and leave by sliding down (emphasized accelerate, 200ms); one scrim whose opacity follows the sheet's travel (same curve and duration both ways), so it clears only as the sheet's last edge leaves. A sheet opened over a sheet replaces its content in place, as one container motion: the height morphs from the first frame on the content's 300ms emphasized curve (no tall empty slab) while the old content fades out by 90ms as it starts to slide and the new content slides the rest of the way in and fades in (90–300ms; `openSheet(…, {motion: 'back'})` reverses it), with no second entrance and no movement while the old words are still on it. The handle (and the header's empty space) drags the sheet 1:1 with the finger; let go past 30% of its height or faster than 0.8 px/ms and it leaves in 150ms, otherwise it settles back in 200ms (emphasized decelerate). Native predictive back can drive it (`rpmBackProgress`/`rpmBackCancel`).
- **Saving** rebuilds the screen off-document and reconciles it in by key: unchanged rows stay the very same nodes (their running animations and focus survive), rows that stay slide to their new place, a kept row or container that changes height grows or shrinks to it (250ms) while the rows below follow, a small new element fades in (150ms), a removed row collapses where it was, a new row opens from zero height, a row whose words change in place fades through (old out by 90ms, new in over 150ms) and a card replaced as a whole (Today's lead) fades through while its height morphs, and scroll and focus hold. Rows are keyed by what they are (Coming up rows by Result or clash, free time by what it follows, so when the item after a gap leaves, that gap stays put and its words fade through while the item and the gap after it close). The first row wholly on screen holds the reading position; changes above it (a row cut off by the top edge included) happen at once, and a page scrolled to its end keeps the length that takes. Scrolled to the end, the page keeps its length while a row leaves, so what is above stays still and the rows below close the gap; the spare space goes as the user scrolls back up. While a sheet is open the page behind it changes at once (nothing moves under the scrim, the first row on screen stays put); when the sheet closes, the changed rows slide from where the user last saw them.
- **Navigation:** push and pop use shared axis X (30dp, 300ms, reversed on Back) with the top bar moving with its page; day to day too. Opening and closing the weekly review is a step down in hierarchy and uses shared axis Y; the navigation bar leaves and returns with Today. Navigation bar tabs fade through (the incoming grows from 92%). Both follow M3's sequence: both layers move from the first frame, the outgoing fades out over 0–90ms and the incoming fades in over 90–300ms, so the two screens are never seen on top of each other. Weekly review steps use shared axis X with only the step body moving; the top bar, progress and footer stay the same nodes and switch their words at the 90ms crossover with the body (Back fades in over 150ms on step 2), and changes inside a step never replay it.
- **Completing a task:** the ring pops and the title strikes through (150ms) and the struck row holds for 300ms so "done" can be read; then one re-render by key does everything in one beat: the row collapses where it is (250ms, its words fading with its space), Completed opens, and the lead card, Coming up and free time change with it (a row whose slot another takes, even one cut off by the top edge, fades through: old out by 90ms, new in over 90–240ms), so the net shift is one motion and all is still by about 600ms. The pop plays once. Undo reopens it in place.
- **Snackbar** enters as one piece: the bar and its words together (the words are in it at full strength from its first visible frame), fading in as it rises 12dp and grows from 96% (150ms emphasized decelerate), and it always leaves downward (150ms). The same message again leaves the bar still and restarts its time. A new message keeps the one opaque bar and swaps the words as a vertical ticker: the old slide up and fade out over 0–90ms, then the new slide in from below over 90–240ms, never both legible. A message raised while a sheet is leaving waits until the sheet is gone. It stays 6s with Undo (4s without) and its timer pauses while a text field has focus. Menus open from their anchor (150ms scale, the surface opaque within 50ms); the overflow menu fades out (100ms, accelerating) and the schedule choices stay opaque as they fold toward their anchor, fading only in their last 50ms.
- **Week strip:** the selected day is a ring that slides to the new day (250ms emphasized) while the day's head stays still and the content below fades through; a swipe steps a week; a long press on a day opens that day's tasks in a sheet with Open day.
- **Moving a card on Today:** a timed card held still for 250ms lifts (102%, `--float-shadow`, an `outline` border) and follows the finger; its old place stays as a dashed `--primary` slot over `primary-container` at 40%, and a 28dp `--inverse-surface` label 12dp above the card's top edge (below the card when it is near the top of the list), never over its title, reads the new start in 15-minute steps (one tick haptic per step). It saves where it is let go with Undo and settles in 200ms. The 24 × 4 `outline-variant` knurl at the foot of a timed card that has not ended drags its length the same way (5-minute steps under 30 min, 15 above); past, done and Anytime cards have none. A long length in the gutter wraps between hours and minutes ("3 h" over "55 min"), never mid-unit. A meal row's swipe reveal has the card's 20dp corners on its outer side, and its "Log now" shows only once the reveal is 7em wide, so the word is never cut.
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

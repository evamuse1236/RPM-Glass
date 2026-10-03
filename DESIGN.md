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
rounded: {xs: "4px", sm: "8px", md: "12px", lg: "16px", card: "24px", xl: "28px", full: "999px"}
spacing: {s1: "4px", s2: "8px", s3: "12px", s4: "16px", s6: "24px", s8: "32px", touch: "48px", top-bar: "64px", nav: "80px", fab: "56px"}
---

# Design System: RPM

## Overview

RPM looks and behaves like one of Google's own Material 3 apps. The reference set is Google Tasks (task rows, Must stars), Calendar (Timeline, day chips), Keep (tonal cards) and Gmail (top bar, navigation, snackbars), including how those apps look on iPhone: generous white space, large rounded containers and a calm palette where colour means something.

The RPM chain stays visible where the user acts. A task serves a Result, the Result has a Purpose, and its ordered tasks form the Plan. Today's lead card puts the next task under its Result and Purpose, and the weekly review is the main planning ritual.

Everything is built from one file, [android-companion/theme.css](android-companion/theme.css). It defines the colour roles, type scale, shape, spacing, elevation and motion tokens. `planner.css`, `capture.css` and `review.css` use those tokens and never introduce their own palette.

## Colour

- The theme is the GM3 Google blue baseline. Light and dark follow the system, or Settings pins one through `data-appearance="light|dark"` on `<html>`.
- **Primary** marks the main action on a screen, focus and links (and Today's "Do next" label). **Primary container** is used for the FAB.
- **Secondary container** marks selection: the navigation pill, selected chips and segmented buttons.
- **Tertiary** (green) means success: an achieved Result and the celebrate banner.
- **Must** (amber, as in Google Tasks) is only used for the Must star.
- **Error** is for overdue text, destructive actions and failures, and always comes with words.
- **Surfaces** step from `surface` (the page) through `surface-container-low` to `surface-container-highest`. Depth comes from these tones, not from shadows.
- **Area hues** (`--area-0` to `--area-7`, Google palette) are the only decorative colour. An Area hue always appears next to the Area name, and `Area.colorIndex` keeps the same hue in both themes.

## Typography

Google Sans Flex is bundled (OFL, latin subset), with the M3 type scale as `font:` shorthand tokens (`--title-medium`, `--body-large` and so on). Page titles use headline-medium and detail titles headline-small (title-large once collapsed into the top bar), Result titles use title-medium, task names use body-large, and metadata uses body-medium on `on-surface-variant`. Times and durations use tabular figures (`.tnum`). Nothing is smaller than label-small (11/16).

Android's text zoom applies the system font scale. At 200% text, rows wrap, metadata gives way before titles and nothing has a fixed text height.

## Icons

Material Symbols Rounded is bundled as a ligature font: `<span class="ms">add</span>`, with `.ms.fill` for selected and set states (the active navigation icon, a set Must star). Every icon button has a 48dp touch target and an accessible label.

## Layout

- **Planner:** a 64dp top app bar with a large page title that collapses into the bar on scroll. On detail screens the bar shows the title only once the large title has scrolled fully out, so only one title is ever legible. Below it is an 80dp navigation bar with four destinations (Today, Blocks, Projects, Life), each with an icon and label and a pill indicator on the current one. The primary-container FAB is a 56dp rounded square above the navigation bar; it steps aside while the page scrolls down and returns on the way back up. Detail screens have none, so nothing floats over a Plan row's Must star: Block detail adds from the inline "Add a task" row under its Plan. Today has no FAB: Add task sits in its top bar beside Capture and Show timeline is in More options, so nothing floats over the day. Pages use 16dp side margins and stop at 720dp wide.
- Detail screens (Block, Project, Goal, Area), Settings, Search and the weekly review are pushed above the four destinations and honour Android Back. The navigation bar is hidden on Settings, Search and the review.
- **Today:** under the date, a strip of the next seven days starting today (swiping steps a week) marks days holding Results' deadlines with an hourglass (and their count when more than one), days with a calendar clash with the clash mark in the error colour, and other days with tasks with a dot; tapping a day lists that day's deadlines and clash above its agenda. Under the strip, one quiet line says where the week's plan stands and opens the weekly review: this week's Results (only Results the user marked achieved count), or from Friday to Sunday "Week of Oct 5 isn't planned · review 7:30 PM" (the user's own timed "Weekly review" task today, which stays in the agenda at its time). Then one lead card for now, the screen's only filled button. When there is half an hour or more free before the next timed task or busy event, it is **Free 8:00 – 10:00 AM · in 1 h** (or "Free until 10:00 AM" once the gap has started): the nearest deadline (overdue first, then due by the end of the day after tomorrow) whose unscheduled tasks fit, as the header, those tasks, and "Schedule at 8:00 AM", which schedules them back to back into the gap with Undo. Otherwise it is **Do next**: a primary "Do next · in 4 h" label (or "Now · 20 min left"), the Result as a short header (title-medium, then its Purpose on its own quieter line, then one facts line: "Due tomorrow 11:00 PM · in 40 h · 5 tasks left"), then the task itself. With large text the title and Purpose wrap in full and the facts keep the deadline; the countdown, the task count, the free card's task durations and the strip give way so the first row below stays in view, and the week line moves under Coming up. **Coming up · Next 3 days** follows: every other Result due in the next three days and every calendar clash, soonest first, as plain list rows with a neutral leading icon, the headline on its own full-width line, then the supporting lines beside at most one trailing text button. A Result row says "Due tomorrow 11:59 PM · in 41 h" (the one deadline format on Today) over "2 tasks left"; one due by the end of the day after tomorrow with nothing planned before its deadline adds "not scheduled yet" and Add to today (dates its first undated task, with Undo). An overdue Result says so in the error colour. A clash (overlapping events, or a timed task and an event, in the next three days; overlaps join into one row) has "Clash · Mon 9 – 11 AM" with Resolve beside it and one line per item with its time span; a task says "can move", and the task that sets a Result's deadline shows "Due 10:30 AM" in place of its span. Resolve opens a sheet listing the overlapping items, where a task can move to just before the clash or open to change its time, both with Undo (never the deadline task in one tap), and a clash of calendar events only offers one task today to sort it out. The error colour is only for a clash or an overdue Result. Then **Later today**: one time-ordered agenda, as Calendar's schedule, with tasks (their Result on a third line) and calendar events (a tonal fixed block whose text lines up with the task titles) interleaved, the free time between them as one quiet line on a dotted rail ("2 h 30 min free"), and tasks with no time last. The Inbox row with its count ends the page. Every row's text starts at the same 56dp edge. The Timeline is a secondary view of the same day.
- **Weekly review:** a full-height route with a close button, a 4-segment progress bar, a scrolling body and a pinned footer (Back and one filled Next). See the flow below.
- **Capture:** a floating panel over whatever app is open, in the style of Google's assistant overlay. It has `surface-container-low`, 28dp corners, light elevation and a drag handle, sits 4dp from the screen edges, and grows upward to fit its content above the keyboard. Expand fills the available height.

Content never nests more than one card level.

## Shape and elevation

Cards use 24dp corners (`--card-radius`). Sheets and the Capture panel use 28dp, inputs 4dp (outlined fields), and chips 8dp. Buttons, the navigation pill and segmented buttons are full pills. Only floating things cast shadows: the FAB, the Capture panel, menus and the snackbar (`--elev-1`, `--elev-3`). Resting cards are flat and tonal.

## Motion

Motion uses the M3 emphasized and standard easing curves at 150, 250 and 400ms. It is short, interruptible and only shows real state changes: a sheet rising, a task completing, Capture moving from saving to sorting to proposals. Reduced motion removes all of it (see the end of `theme.css`).

## Components

- **Task row** (Google Tasks): a circular completion checkbox with a 48dp target, the title, then the time, duration and Area on one line, and, on a Must only, a filled star on the right. Non-Musts show nothing there, and the star is a mark, not a button: Must is set in the task sheet (Dara's decision, 2026-10-03), so a stray tap never changes it. A time carries its day unless it is today ("Tomorrow 9:00 PM", "Mon 9:45 AM"); a Plan row also says "Today". Must is the amber star alone (with an accessible name), never the star and the word; Block detail gives the legend once, the star beside "of Musts left". Titles wrap with `text-wrap: pretty` so a row never ends on one orphaned word. Completed rows strike through and move into a collapsed Completed group. Overdue rows say "Overdue".
- **Result group / Block card:** a tonal card with the Result (title-medium), Purpose (body-medium, variant colour), one facts line (the deadline in medium weight, the open Must time after a Must star, "2 of 7 done"; no countdown, the day says how near it is) and the next task. On the Blocks list, cards in a row from the same Project sit under one Area and Project line, as Calendar's schedule names a day once; a Project filter or the Project page already says it, so there it is left out. "Picked for this week" marks the Results chosen in the weekly review.
- **Block detail** reads like a Google Tasks detail page. Under the Area and Project link line and the headline-small title come icon rows, each 24dp icon centred on the Plan's check column and its text aligned with the task titles, in the order of the Block card: the Purpose (labelled), then where the Result stands by its progress ring ("Due tomorrow 11:00 PM · 41 h left" over "2 of 7 done · ★ 3 h 50 min of Musts left", the star being the Must legend; "2 of 7 tasks done" leads when there is no deadline), then "Is this Result achieved?" with the subline "Ticked tasks don't decide it" and an outlined Mark achieved button (the green achieved panel in its place once marked; both ways have Undo). The deadline line uses the error colour, with words, when overdue or tight. Then the Plan, whose header holds Sort by time (only while dated tasks are out of time order) and a Reorder text button; Plan rows have no drag handle until Reorder is tapped. "Add a task" sits inline under the Plan, and there is no FAB. Once the title has scrolled away, the top bar shows it with the deadline line as its subtitle. There are no chips or tonal panels above the Plan. Task completion never marks a Result achieved; only the user does.
- **Buttons:** one filled button per screen, tonal or outlined for secondary actions, and text buttons for tertiary ones. All are 40dp visually inside a 48dp target.
- **Chips:** filter chips for views and filters, assist chips for a Capture proposal's date and for suggestions.
- **Snackbar:** an inverse surface with a single Undo action. Every plan change made from the planner, the review or Capture can be undone.
- **Sheets:** Task detail and Quick add are bottom sheets with 28dp top corners. The primary action stays above the keyboard.

### Weekly review

1. **How did last week's Results go?** Results whose deadline is still ahead are not judged: they sit under "Still running" as one row each (deadline, Must time left) with a Carry chip that pre-picks them in step 4. The rest are cards with tasks done/total on a thin bar, a counter of how many are decided, and one segmented button (Achieved / Partly / Not yet); a Result with every task ticked asks, in plain variant text, "Every task is ticked. Did the Result itself happen?". Only the chosen segment carries colour (Achieved fills tertiary); the card itself stays neutral, with an optional "What made it work?" line (saved as the Result's evidence). The short Wins card after the cards is the one celebration. Partly and Not yet offer "Carry into this week" and a small Carry / Defer / Drop segmented button per unfinished task. Drop archives the task and can be undone.
2. **Empty your head.** An inline field ("Ideas, wants, to-dos") adds what is typed to the Inbox on Enter (saved in the user's words, with Undo) without leaving the step. Under it, the user's Areas are assist chips ("Stuck? Think through each Area") that only change the field's prompt. Below is the Inbox with its count, Open Capture as a text button, and each task's Must star (alone) or date where it has one.
3. **Sort the Inbox.** Each Inbox task is one row: its words, a Choose text button at the end, and, when the words clearly point to one Result (a word shared with the Result's own title, well ahead of the next), an outlined chip with that Result that adds the task in one tap, with Undo. Choose opens a bottom sheet titled "Choose a Result" with the task under it: New Result first, then every Result with its Purpose, likeliest first. New Result asks "What's the Result?" and "Why does it matter?" (both needed). Back and Next stay in the footer throughout. Tasks sorted during the review appear under "Sorted" beneath their Result, each with a button back to the Inbox. "Ask Jev" sits in the Inbox header when the assistant is set up, with the line "Jev proposes; nothing moves until you confirm."
4. **Pick this week's Results.** "3 picked · aim for 3 to 5" leads, and Results are ordered by deadline, picked or not, then those without one. A Result's deadline is its latest open, dated, one-time task; nothing else is assumed. One outlined summary holds a day strip from today to Sunday (free hours, ★ the Must time already on that day, an hourglass on deadline days, a warning on calendar-clash days, error container when Must time doesn't fit), a one-line legend, and one summary line ("6 h 20 min of Must · fits before every deadline", with the tightest Result or the Musts that have no day under it). Tapping it opens one row per picked Result, in deadline order, with the same deadline words and Must time as its card, its free time until that deadline, and Fits, Tight (over half the free time) or Short by. Each row counts the Musts due before it too, and says so when that changes the verdict. Undated Musts of Results with a deadline get a suggested day (the freest day before the deadline, never on or after it); "Give them these days" writes them in one change with Undo. Free time is 8 AM–10 PM minus busy events from the read-only calendar, and the legend says so; without a readable calendar it says "Calendar not connected" and shows only Must time. Then plain rows, each with an error-coloured lead and one action, as on Today: a calendar clash not yet dealt with (Add to Today adds a task to sort it out, or Plan today puts the Inbox task that already names it on Today; once it has a day only the strip's warning remains), and, once at least one Result is picked, each Result due by Sunday that isn't (Pick). Picked cards keep their tone and gain a primary outline and a filled check. Cards carry one facts line (deadline, Must time, Carried from last week); a near Result with no Must says "No Must set". The Result picked last lists its open tasks under "Tap the tasks that must happen": each row toggles Must, and only Musts show the star (each task's day on its own line) and Open Plan; the other picked ones fold to "5 open tasks · 3 Musts". Results with no open tasks wait behind one collapsed row. Finishing saves the week's focus and returns to Today.

The review says Result throughout: a Block is a Result with its Purpose and tasks, and the review only names the Result. Every step can be skipped, leaving keeps progress, and every change goes through the same Undo path as the planner. Next and Finish are always the one filled button and never disabled; each step's own counts ("1 of 2 decided", "3 picked", the Not picked rows) guide instead of a footer caption. The footer has no fade; a hairline shows while content continues underneath.

### Capture

The full behaviour is in [PRODUCT.md](PRODUCT.md#capture). Visually, the panel has a header (a monochrome `edit_note` glyph in a primary-container circle, the title, Expand, Close, with Expand drawn no heavier than Close) and a content area that shows one current state at a time: empty, listening, saving, saved and sorting, proposals, one question, or a receipt with Undo. At the bottom is one filled pill composer in every state, with More at the start and the microphone, which becomes a filled Send button once there is text; past one line the words take the full width and the buttons drop to a row beneath (Gemini). While Capture is empty or being typed in, focus draws a 2dp primary ring. The empty state is the field alone with the one trust line under it; the planning starters live in More. Sorting shows the saved words, one slim progress line and one sentence, no skeletons. Proposals use a single border level: one outlined list with a divider between rows. Every row has one structure, in proposals and receipt alike: a 48dp leading slot (an include checkbox, or a success check once added), the title (body-large) with the Must star, the destination as a two-line list item (stacks or inbox icon, the Block name, its Result's deadline under it in body-medium variant, and a drop-down arrow while it can be changed), a date assist chip ("Sun 4 Oct, 9:00 AM" or "No date"), then at most one body-medium note on what else holds that day (error colour for a calendar overlap). Unticked rows fade to half strength. There are no Area dots on proposals or in the Block picker. Within one capture the panel only grows, so the composer and the main action keep their place; the receipt settles to its own height.

## Do

- Use only theme.css roles and tokens. If a new value is genuinely needed, add a token there.
- Keep the vocabulary exact: Area, Goal, Project, Block, Result, Purpose, Plan, Task, Must, No block, Inbox.
- Show Result and Purpose wherever a task is acted on.
- Keep 48dp targets, Android Back closing the topmost layer first, 200% text reflow and reduced motion.

## Don't

- Don't add glass, blur, gradients or aurora light. Those belonged to the old Capture and are gone.
- Don't use colour alone to carry meaning, nest cards or add a fifth navigation destination.
- Don't write Capture proposals into the Plan without a confirmation tap, or treat finished tasks as an achieved Result.

## Not yet redesigned

The butterfly launcher and the desktop browser prototype keep their older styles until they are redesigned.

## Home-screen widget

The widget is a RemoteViews bar, so it uses native resources instead of theme.css. `res/values/colors.xml` and `res/values-night/colors.xml` mirror the theme.css roles as `rpm_*` colours; change both files together. The bar is `surface-container` with the launcher's widget corner radius on Android 12+ (28dp before). Capture is the main action in `primary-container`; Check in, Remind and Open app rest on the surface with `on-surface-variant` icons and an M3 pressed state. Labels are label-medium (12sp medium) and wrap to two lines at large text. Custom fonts are not available in RemoteViews, so the widget uses the system sans-serif.

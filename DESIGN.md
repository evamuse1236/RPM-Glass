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

The RPM chain stays visible where the user acts. A task serves a Result, the Result has a Purpose, and its ordered tasks form the Plan. Today is grouped by Result with the Purpose under each title, and the weekly review is the main planning ritual.

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

Google Sans Flex is bundled (OFL, latin subset), with the M3 type scale as `font:` shorthand tokens (`--title-medium`, `--body-large` and so on). Page titles use headline-medium (title-large once collapsed into the top bar), Result titles use title-medium, task names use body-large, and metadata uses body-medium on `on-surface-variant`. Times and durations use tabular figures (`.tnum`). Nothing is smaller than label-small (11/16).

Android's text zoom applies the system font scale. At 200% text, rows wrap, metadata gives way before titles and nothing has a fixed text height.

## Icons

Material Symbols Rounded is bundled as a ligature font: `<span class="ms">add</span>`, with `.ms.fill` for selected and set states (the active navigation icon, a set Must star). Every icon button has a 48dp touch target and an accessible label.

## Layout

- **Planner:** a 64dp top app bar with a large page title that collapses into the bar on scroll. On detail screens the bar shows the title only once the large title has scrolled fully out, so only one title is ever legible. Below it is an 80dp navigation bar with four destinations (Today, Blocks, Projects, Life), each with an icon and label and a pill indicator on the current one. The primary-container FAB is a 56dp rounded square above the navigation bar; it steps aside while the page scrolls down and returns on the way back up. Of the detail screens only Block detail has one (Add a task). Today has no FAB: Add task sits in its top bar beside Capture and Show timeline is in More options, so nothing floats over the day. Pages use 16dp side margins and stop at 720dp wide.
- Detail screens (Block, Project, Goal, Area), Settings, Search and the weekly review are pushed above the four destinations and honour Android Back. The navigation bar is hidden on Settings, Search and the review.
- **Today:** under the date, the Mon–Sun strip (past days quieter) marks days with tasks with a dot and days holding a Result's deadline with an hourglass. Then, in order of what Dara needs first: **Do next**, the first card, starts with the next task itself (checkbox, title, Must star) under a primary "Do next · starts in 4 h" label (the task's one emphasis), then what it is for on one line (the Result, then its Purpose), the Result's facts with its countdown, and the rest of that Result's day. **At risk** follows as plain rows, each with an error-coloured icon and lead words and one action: a calendar clash in the next three days (overlapping events, or a timed task and an event; overlaps join into one line; Move opens the task, or Add to today adds one task to sort it out, since calendars are read-only), a Result due by tomorrow with nothing planned today (Plan today dates its first undated task, with Undo), or an overdue Result. Then the one planning row: this week's Results, or from Friday to Sunday "Week of … isn't planned" with the screen's one filled button, Plan now (a "Weekly review" task today folds into this row). Then the day's other Results as tonal cards (title, Purpose, one facts line: Area with its hue, "2 of 7 tasks done", the deadline and its countdown). Calendar events, "Also today" (tasks with no Block) and **Due soon** (Results due within three days that have no card or risk line today, Calendar-schedule style with a fixed date gutter) are plain lists, not cards. The Inbox row ends the page. Every row's text starts at the same 56dp edge, and each Result appears once. The Timeline is a secondary view of the same day.
- **Weekly review:** a full-height route with a close button, a 4-segment progress bar, a scrolling body and a pinned footer (Back, Next, and a hint line while a step is unfinished). See the flow below.
- **Capture:** a floating panel over whatever app is open, in the style of Google's assistant overlay. It has `surface-container-low`, 28dp corners, light elevation and a drag handle, sits 4dp from the screen edges, and grows upward to fit its content above the keyboard. Expand fills the available height.

Content never nests more than one card level.

## Shape and elevation

Cards use 24dp corners (`--card-radius`). Sheets and the Capture panel use 28dp, inputs 4dp (outlined fields), and chips 8dp. Buttons, the navigation pill and segmented buttons are full pills. Only floating things cast shadows: the FAB, the Capture panel, menus and the snackbar (`--elev-1`, `--elev-3`). Resting cards are flat and tonal.

## Motion

Motion uses the M3 emphasized and standard easing curves at 150, 250 and 400ms. It is short, interruptible and only shows real state changes: a sheet rising, a task completing, Capture moving from saving to sorting to proposals. Reduced motion removes all of it (see the end of `theme.css`).

## Components

- **Task row** (Google Tasks): a circular completion checkbox with a 48dp target, the title, then the time, duration and Area on one line, and a Must star on the right. A time carries its day unless it is today ("Tomorrow 9:00 PM", "Mon 9:45 AM"); a Plan row also says "Today". Must is the amber star alone (with an accessible name), never the star and the word; Block detail gives the legend once, the star beside "of Musts left". Titles wrap with `text-wrap: pretty` so a row never ends on one orphaned word. Completed rows strike through and move into a collapsed Completed group. Overdue rows say "Overdue".
- **Result group / Block card:** a tonal card with the Area and Project line (left out when a Project filter or the Project page already says it), the Result (title-medium), Purpose (body-medium, variant colour), one facts line (a small progress ring, the deadline in medium weight, "2 of 7 done") and the next task. "Picked for this week" marks the Results chosen in the weekly review.
- **Block detail** reads like a Google Tasks detail page. Under the Area and Project link line and the large title come icon rows, each 24dp icon centred on the Plan's check column and its text aligned with the task titles: the deadline ("Due tomorrow 11:00 PM · 41 h left", with "Last step: …" naming the task that sets it), the Purpose (labelled), "Is this Result achieved?" with a Mark achieved text button (the green achieved panel in its place once marked), and progress (a ring, "2 of 7 tasks done", then "★ 3 h 50 min of Musts left · 4 h 55 min in total"). Then the Plan, whose header holds Sort by time (only while dated tasks are out of time order) and the Reorder icon; Plan rows have no drag handle until Reorder is tapped. The due row and time line use the error colour, with words, when overdue or tight. A FAB adds a task to the Plan from anywhere on the page, and "Add a task" also sits inline under the Plan. There are no chips or tonal panels above the Plan. Task completion never marks a Result achieved; only the user does.
- **Buttons:** one filled button per screen, tonal or outlined for secondary actions, and text buttons for tertiary ones. All are 40dp visually inside a 48dp target.
- **Chips:** filter chips for views and filters, assist chips for Capture starters and suggestions.
- **Snackbar:** an inverse surface with a single Undo action. Every plan change made from the planner, the review or Capture can be undone.
- **Sheets:** Task detail and Quick add are bottom sheets with 28dp top corners. The primary action stays above the keyboard.

### Weekly review

1. **How did last week's Results go?** A counter says how many are decided. Each Result shows tasks done/total with a thin bar, its deadline if it has one, and Achieved / Partly / Not yet filter chips; a Result with every task ticked asks "Did the Result happen?". Achieved turns the card tertiary green as a win, with an optional "What made it work?" line (saved as the Result's evidence), and a short Wins card closes the step. Partly and Not yet offer "Carry into this week", which pre-picks the Result in step 4, and Carry, Defer or Drop chips for unfinished tasks. Drop archives the task and can be undone.
2. **Empty your head.** An inline field adds what is typed to the Inbox on Enter (saved in the user's words, with Undo) without leaving the step. Below it is the Inbox with its count, Open Capture as a text button, and each task's date or Must where it has one.
3. **Group into Blocks.** Inbox tasks are one-line rows with a checkbox and a Move button. Selecting tasks turns the top bar into a selection bar (count, New Result); tapping a Result under "Your Results" adds them there, and New Result asks "What's the Result?" and "Why does it matter?" (both needed). Tasks grouped during the review appear under their Result, so Blocks visibly form. Move opens an inline picker (Inbox, a Result, New Result). Sort with Jev appears when the assistant is set up.
4. **Pick this week's Results.** Results are ordered by deadline. A Result's deadline is its latest open, dated, one-time task; nothing else is assumed. A summary shows how many are picked ("aim for 3–5"), Must and planned time, and how much Must work falls before each deadline; there is no calendar here, so it never claims the time fits. A near Result with no Must says "No Must set". Picked Results list their open tasks with Must stars and dates. Finishing saves the week's focus and returns to Today.

Every step can be skipped, leaving keeps progress, and every change goes through the same Undo path as the planner. Next and Finish are never disabled: until a step's job is done (every Result decided, at least 3 picked) the button is tonal with a one-line hint, then it turns filled. The footer has no fade; a hairline shows while content continues underneath.

### Capture

The full behaviour is in [PRODUCT.md](PRODUCT.md#capture). Visually, the panel has a header (RPM mark, title, Expand, Close, with Expand drawn no heavier than Close) and a content area that shows one current state at a time: empty with starter chips, listening, saving, saved and sorting, proposals, one question, or a receipt with Undo. At the bottom is a filled pill composer with More at the start and the microphone, which becomes a filled Send button once there is text; it turns into a quieter outlined field while a decision is pending. The empty state is field-first: starter chips wrap above the composer and the one trust line sits under it. Sorting shows the saved words, one slim progress line and one sentence, no skeletons. Proposals use a single border level: one outlined list with a divider between rows; each row is the title with the Must star, then one quiet summary line (destination · date · Must, with the Block's due line under it) that opens editing when tapped. There are no Area dots on proposals or in the Block picker. The receipt repeats each task's summary line in body-small. Within one capture the panel only grows, so the composer and the main action keep their place.

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

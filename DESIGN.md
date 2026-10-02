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
- **Primary** marks the main action on a screen, focus and links. **Primary container** is used for the FAB and the most important card (the "This week" card).
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

- **Planner:** a 64dp top app bar with a large page title that collapses into the bar on scroll. Below it is an 80dp navigation bar with four destinations (Today, Blocks, Projects, Life), each with an icon and label and a pill indicator on the current one. The primary-container FAB is a 56dp rounded square above the navigation bar. Pages use 16dp side margins and stop at 720dp wide.
- Detail screens (Block, Project, Goal, Area), Settings, Search and the weekly review are pushed above the four destinations and honour Android Back. The navigation bar is hidden on Settings, Search and the review.
- **Today:** the "This week" card comes first (this week's Results and their progress, or "Plan your week"). Then come the day's tasks grouped by Result, each group a tonal card with the Result as title and the Purpose underneath. Tasks with no Block sit under No block. The Timeline is a secondary view of the same day.
- **Weekly review:** a full-height route with a close button, a 4-segment progress bar, a scrolling body and a pinned footer (Back, Next). See the flow below.
- **Capture:** a floating panel over whatever app is open, in the style of Google's assistant overlay. It has `surface-container-low`, 28dp corners, light elevation and a drag handle, sits 4dp from the screen edges, and grows upward to fit its content above the keyboard. Expand fills the available height.

Content never nests more than one card level.

## Shape and elevation

Cards use 24dp corners (`--card-radius`). Sheets and the Capture panel use 28dp, inputs 4dp (outlined fields), and chips 8dp. Buttons, the navigation pill and segmented buttons are full pills. Only floating things cast shadows: the FAB, the Capture panel, menus and the snackbar (`--elev-1`, `--elev-3`). Resting cards are flat and tonal.

## Motion

Motion uses the M3 emphasized and standard easing curves at 150, 250 and 400ms. It is short, interruptible and only shows real state changes: a sheet rising, a task completing, Capture moving from saving to sorting to proposals. Reduced motion removes all of it (see the end of `theme.css`).

## Components

- **Task row** (Google Tasks): a circular completion checkbox with a 48dp target, the title, then the time, duration and Area on one line, and a Must star on the right. Completed rows strike through and move into a collapsed Completed group. Overdue rows say "Overdue".
- **Result group / Block card:** a tonal card with the Result (title-medium), Purpose (body-medium, variant colour), progress and the next task. Block detail adds a Purpose panel, the ordered Plan and the "Mark Result achieved" button with an optional line of evidence. Task completion never marks a Result achieved; only the user does.
- **Buttons:** one filled button per screen, tonal or outlined for secondary actions, and text buttons for tertiary ones. All are 40dp visually inside a 48dp target.
- **Chips:** filter chips for views and filters, assist chips for Capture starters and suggestions.
- **Snackbar:** an inverse surface with a single Undo action. Every plan change made from the planner, the review or Capture can be undone.
- **Sheets:** Task detail and Quick add are bottom sheets with 28dp top corners. The primary action stays above the keyboard.

### Weekly review

1. **How did last week's Results go?** Each Result shows tasks done/total and a segmented Achieved / Partly / Not yet choice, with optional evidence. Unfinished tasks get Carry, Defer or Drop chips. Drop archives the task and can be undone. A green banner celebrates an achieved Result.
2. **Empty your head.** The Inbox count, an Open Capture button and the Inbox list.
3. **Group into Blocks.** Each Inbox task gets a Block picker (an existing Block, a new Block with Result and Purpose, or stays in the Inbox). Sort with Jev appears when the assistant is set up.
4. **Pick this week's Results.** Choose 3 to 5 Results, with Must time against planned time per Result and in total, and Must stars on their tasks. Finishing saves the week's focus and returns to Today.

Every step can be skipped, leaving keeps progress, and every change goes through the same Undo path as the planner.

### Capture

The full behaviour is in [PRODUCT.md](PRODUCT.md#capture). Visually, the panel has a header (RPM mark, title, Expand, Close) and a content area that shows one current state at a time: empty with starter chips, listening, saving, saved and sorting, proposals, one question, or a receipt with Undo. At the bottom is a filled pill composer with More at the start and the microphone, which becomes a filled Send button once there is text. Proposals are cards with the title, destination (Block, or Inbox · No block), date and time chips and a Must star.

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

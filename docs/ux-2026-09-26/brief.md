# RPM app: UX critique and design direction

**Summary:** The app is built on a strong idea (Result → Purpose → Plan), but the interface doesn't show it. Screens look like a generic to-do app with the RPM concepts tucked into small grey text. The main problems are a weak visual hierarchy, too many overlapping controls, cards nested inside cards, inconsistent names for the same things, and floating buttons that cover content. Most importantly, the Daily view doesn't keep the task's larger purpose in view, even though that's the app's main promise.

This document has three parts:
1. **Critique:** what's wrong and why, with a severity for each item.
2. **Design system:** shared rules, with exact values an engineer can apply without design judgement.
3. **Screen-by-screen specs and build order:** step-by-step instructions with acceptance criteria.

---

## Part 1: Critique

Severity: 🔴 Critical (breaks the core purpose or usability) · 🟠 Major · 🟡 Minor

### 1.1 Problems across all screens

| # | Issue | Severity | Why it matters |
|---|---|---|---|
| G1 | **The purpose is invisible where you act.** Daily task cards show only a time and a title. Result and Purpose appear only in Task detail. | 🔴 | The product promises to keep the larger purpose in view. Right now Daily is a plain calendar list. |
| G2 | **Two floating buttons (Search + Add) on every screen** cover content. On RPM, Search covers the priority control. On Projects and Life, they cover card text. | 🔴 | Content is hidden and taps land on the wrong target. Search as a floating button is also unusual. |
| G3 | **Different names for the same things:** "Outcomes" (Projects filter), "Result" (task detail), "Tasks" and "actions" ("1 of 8 actions completed"), "RPM", "Blocks", "Life Vision" vs. the "Life" tab. | 🔴 | The method is already new to users. Unstable wording stops them from building a mental model. |
| G4 | **Three separate ways to mark importance on one task:** a star, a Priority 1–3 stepper, and a red "Must do" label. | 🟠 | Users can't tell them apart, and each task row gets crowded. |
| G5 | **Cards inside cards inside cards** (Projects: project card → "RPM Blocks Breakdown" → block card. Life: area card → goal → project). | 🟠 | Hierarchy gets harder to read with each level, padding piles up, and text is squeezed into a narrow column. |
| G6 | **Text is too small and too faint.** Many labels ("Priority", "Completed", "25%", "45 min estimate", chip text) look like 9–10pt, in grey on dark grey. | 🟠 | Fails WCAG contrast and is hard to read. It will break when the user increases font size in Android settings. |
| G7 | **One accent colour does every job.** Periwinkle marks the selected tab, selected chips, links, primary buttons, labels ("Result"), and settings values. | 🟠 | Nothing stands out when everything is highlighted. The blue "Result" and "Purpose" labels look like tappable links. |
| G8 | **Colours without a clear meaning:** yellow left bars on Daily cards, an orange eyebrow on RPM cards, a green eyebrow on Projects, a red "Must do". | 🟠 | Users try to decode colour, find no rule, and stop trusting it. |
| G9 | **Settings takes a bottom-nav tab.** | 🟡 | You open Settings rarely. It shouldn't cost a slot that daily users see all the time. |
| G10 | **The bottom nav is transparent over content**, and a "Solid navigation" setting exists to fix it. | 🟡 | A setting that works around a known problem means the default is wrong. |
| G11 | **Many touch targets are too small:** priority chevrons, star, pencil icons, chip × and filter chips, the Agenda/Timeline toggle, the four-option Life segmented control. | 🟠 | Android recommends 48dp. Several of these look like 20–28dp. |
| G12 | **Progress is shown four different ways:** a 13% ring, "1 of 4 done", "1 of 8 actions completed", and a 25% bar with "1 of 4 actions completed" next to it. | 🟡 | Showing the same number twice adds noise. Different formats make it harder to compare. |
| G13 | **Filter chips are cut off** ("Feel str", "Health", "Creative"), and the chips hold long project names. | 🟡 | Long chip labels don't scale. With 10 projects the row becomes unusable. |

### 1.2 Problems on each screen

<details>
<summary><strong>Daily (Today)</strong></summary>

- 🔴 **You can't complete a task from Daily.** There's no checkbox, so the most frequent action in the app takes at least two taps.
- 🔴 No Result or Purpose context on task cards (see G1).
- 🟠 No sense of "now": no current-time marker, no "Next up", no overdue state.
- 🟠 Unscheduled must-do tasks have nowhere to show, yet the editor lets you leave a task unscheduled.
- 🟠 The yellow bars look identical on every card, so they carry no information.
- 🟡 The week strip doesn't show which days have tasks. Scanning ahead is a guess.
- 🟡 The Agenda/Timeline toggle is small and far from the thumb. The large empty area below the cards is wasted.
- 🟡 "10:30 am · 30m" is truncated ("30r"). The meta line isn't built for real-world text lengths.
</details>

<details>
<summary><strong>RPM (blocks list)</strong></summary>

- 🔴 **The whole action plan sits inside each list card**, with checkboxes, stars, priority steppers, estimates, times, and "Must do". The list turns into a wall of controls, and you see about one block per screen.
- 🟠 Each task row has **seven elements** (checkbox, title, estimate, time, Must do, star, priority stepper). The title wraps to three lines ("Discuss the chapter with a friend").
- 🟠 The Purpose ("Why it matters") is set in small grey text, although it's the emotional core of the method. The Result title is the only strong element.
- 🟠 The priority stepper (a number with a chevron) is an unfamiliar control and far too small.
- 🟡 The tab name "RPM" is jargon, and it's also the app's name.
- 🟡 The pencil icon is small and isolated. It's unclear whether it edits the block or the task.
- 🟡 "1h 50m" with a clock icon has no label: time planned, remaining, or spent?
</details>

<details>
<summary><strong>Projects</strong></summary>

- 🟠 The "Meaningful progress" summary uses a tiny ring with the word "Completed" at unreadable size, and repeats the same data in text.
- 🟠 Cards nest three levels deep (G5). "RPM Blocks Breakdown (1)" is internal wording, not user wording.
- 🟠 The filter "All Outcomes (3)" uses the word Outcome, which appears nowhere else. The other chips are life areas, so the chip row mixes two concepts.
- 🟡 "Add RPM block" is a plain text link inside the nested card and is easy to miss.
- 🟡 The last card runs under the floating buttons and the nav.
</details>

<details>
<summary><strong>Life (Life Vision)</strong></summary>

- 🟠 The four-option segmented control (Yearly Vision / Q3 Focus / Monthly / Core Values) is crammed. The labels are about 8pt, and these are really four separate views, not filters.
- 🟠 The Wheel of Life radar chart is roughly 40dp wide and has no labels, so it's decoration rather than information.
- 🟠 The "Your life areas" card repeats the Projects hierarchy (area → goal → project) in a squeezed nested form.
- 🟡 "Edit area & rating" is a faint link. Rating, the main interaction on this screen, is hidden.
- 🟡 The area chips under the wheel ("Learning & Growth 8.2") duplicate the list below.
</details>

<details>
<summary><strong>Settings</strong></summary>

- 🟠 "Solid navigation" uses a square checkbox inside a radio-button group, so it looks like a fourth theme option.
- 🟡 Values like "Default alarm" are in the accent colour and look like links. Rows have no chevrons, so users can't tell they open something.
- 🟡 The "Color appearance" sub-label repeats the "Planner appearance" header.
- 🟡 The nav bar floats over the settings rows (G10).
</details>

<details>
<summary><strong>Task detail sheet</strong></summary>

- 🔴 **The "Done" button is ambiguous:** it could mean "close" or "mark complete". Users will tap it expecting to complete the task and nothing will happen, or the reverse.
- 🔴 There's no way to complete the task from its own detail view.
- 🟠 Actions are scattered text links: "Open RPM block" alone, then "Ask AI · Move · Archive" in a row, then "Delete task" in the same style. Delete isn't styled as destructive or separated.
- 🟠 The labels Result, Purpose, How/notes, and Original capture all look the same. The relationship "this task serves this Result, for this Purpose" isn't shown.
- 🟡 "Original capture" repeats the title word for word, which is noise when nothing changed.
- 🟡 The date format "26/9/2026" differs from the app's other format ("Saturday, September 26").
</details>

<details>
<summary><strong>Task editor sheet</strong></summary>

- 🟠 It's a long, flat form: every option has equal weight and the title field isn't emphasised. Quick entry feels like filling in paperwork.
- 🟠 Instructions sit inside labels ("Start · leave blank to keep unscheduled"), and a dense paragraph of system text explains repeat conflicts before the user has picked a repeat.
- 🟠 **The editor has a Purpose field** while also assigning an RPM block, which already has a Purpose. It's unclear which one wins.
- 🟡 "Estimated minutes" is a bare number field. Most people think in presets (15/30/60).
- 🟡 "Unsorted" is jargon. Use "No block".
- 🟡 The sheet title "New task" and the header "Today" behind it both show, so there are two headers.
</details>

<details>
<summary><strong>Capture and Capture options</strong></summary>

- 🔴 **The purpose of this screen isn't clear.** It's labelled "RPM", asks "What's on your mind?", has "Ask anything…" in the input, and offers "Chat / Plans / Context / History…". Is it quick capture, an AI chat, or both?
- 🔴 **The options menu is eight icon buttons stacked vertically** on the right with tiny labels. It covers the main prompt text, and it includes window controls (Expand, Minimize) and a second Settings.
- 🟠 A stray red dot at the top right has no meaning. If it's a recording indicator it needs a label. If it's a bug, remove it.
- 🟡 The suggestion chips are truncated ("My preferences" cut off at the edge).
- 🟡 The whole screen is empty space. The prompt could sit near the input where the thumb and eyes already are.
</details>

---

## Part 2: Design direction

### 2.1 Design principles (use these to settle any disagreement)

1. **Purpose travels with the task.** Anywhere a task appears, show its Result in one tap or less, and ideally at a glance.
2. **Keep the list simple and put detail one level down.** List screens show a summary. Controls live on detail screens.
3. **One concept, one word, one visual.** No synonyms, and no colour without a fixed meaning.
4. **One card level only.** Never place a card inside a card. Inside a card, use list rows with dividers.
5. **One primary action per screen.** There's at most one filled button and one floating button per screen.
6. **The thumb zone is sacred.** Frequent actions go at the bottom and rare ones in the top bar or an overflow menu.

### 2.2 Vocabulary (make this binding across UI text, docs, and code names)

| Level | UI term (use exactly) | Never use |
|---|---|---|
| Life area | **Area** (e.g. "Learning & Growth") | Life vision category |
| Yearly goal | **Goal** | Outcome, vision item |
| Project | **Project** | Outcome |
| RPM block | **Block** (screen title "Blocks"). Its three parts are **Result**, **Purpose**, **Plan** | "RPM block" in UI text, Breakdown, Outcome |
| Task | **Task** | Action, item |
| Importance | **Must** (a single flag, shown as ★) | Star, priority, "Must do" as separate ideas |
| Unassigned | **No block** / **Inbox** | Unsorted |

Keep "RPM" only as the product name and on onboarding screens that explain the method.

### 2.3 Merge the three importance controls into one

- Remove the **Priority 1–3 stepper** entirely. Priority becomes **the task's position in the Plan list**, changed with a drag handle (this matches how RPM orders actions).
- Remove the **"Must do" text label**.
- Keep **★ Must** as a single on/off toggle. Filled amber means must, an outline means optional.
- Data migration: set Must = true if the task was starred or marked "Must do". Order tasks by old priority, then by time.

### 2.4 Design tokens (define once and use everywhere)

The engineer should create these as named theme values and **forbid hard-coded colours and sizes** in screens (enforce with lint or code review).

<details open>
<summary><strong>Colour roles (dark theme)</strong></summary>

| Token | Suggested value | Used for (only) |
|---|---|---|
| `bg` | #0E1014 | Screen background |
| `surface-1` | #171A20 | Cards, sheets, nav bar (solid) |
| `surface-2` | #20242C | Inputs, selected rows, pressed states |
| `outline` | #2C313A | Dividers, input borders |
| `text-primary` | #ECEEF2 | Titles, task names, body |
| `text-secondary` | #A9AFBA | Meta lines, Purpose text, setting values |
| `text-disabled` | #6B717C | Disabled only. Never for information |
| `accent` | #8FA8FF | Primary button, selected nav or chip, focus ring, links |
| `on-accent` | #0E1014 | Text on accent |
| `must` | #F4B740 | ★ Must icon only |
| `danger` | #FF6B6B | Delete, overdue, errors |
| `success` | #5CD69B | Completed checkmark and bars at 100% |
| `area-1…area-8` | 8 muted, distinct hues (e.g. teal, violet, coral, lime, sky, rose, sand, mint) | **Life-area identity only**: dot, left bar, eyebrow |

Rules:
- **Area colour is the only colour that decorates.** Each Area gets one hue, chosen by the user or assigned automatically. That hue appears as the left bar on task rows, the dot before an eyebrow label, and chart segments. This replaces the random yellow, orange, and green.
- Section labels like "Result" and "Purpose" use `text-secondary`, never `accent`.
- Setting values use `text-secondary`, never `accent`.
- Contrast: `text-primary` and `text-secondary` must reach at least 4.5:1 on `surface-1`. Check them with a contrast checker before committing.
- Build a matching light theme with the same role names.
</details>

<details open>
<summary><strong>Type scale (sp; nothing smaller than 12)</strong></summary>

| Token | Size / line height | Weight | Used for |
|---|---|---|---|
| `title-screen` | 28 / 34 | Semibold | "Today", "Blocks", "Projects" |
| `title-section` | 20 / 26 | Semibold | Section headers, sheet titles |
| `title-card` | 17 / 22 | Semibold | Result titles, project titles, task title in detail |
| `body` | 15 / 21 | Regular | Task names in rows, Purpose text, form input |
| `meta` | 13 / 18 | Regular | Time, duration, counts |
| `label` | 12 / 16 | Medium, +0.4 letter-spacing | Eyebrows, chip text, nav labels |

- At most **3 sizes on any single card**.
- Everything must still work at 200% system font size: text wraps, and no container has a fixed height.
</details>

<details open>
<summary><strong>Spacing, shape, and size</strong></summary>

- **4dp grid.** Allowed spacing values are 4, 8, 12, 16, 24, 32.
- Screen side padding: 16. Card inner padding: 16. Gap between cards: 12. Gap between sections: 24.
- Corner radius: cards 16, inputs and chips 12, buttons fully rounded, bottom sheet top corners 24.
- **Minimum touch target 48×48dp.** The icon can be 24dp inside a 48dp hit area.
- List row minimum height: 56dp with one line, 72dp with two lines.
- Scrollable content gets bottom padding of nav height + floating button height + 16, so the last item can always scroll clear of the buttons.
</details>

### 2.5 Core components (build these once, then use them everywhere)

<details open>
<summary><strong>C1: Task row (the most important component)</strong></summary>

Layout, left to right:
1. **Area bar:** a 3dp-wide vertical bar in the task's Area colour, full row height. Neutral `outline` colour if the task has no block.
2. **Checkbox:** 24dp visual, 48dp tap area. Tapping completes the task **without opening it**.
3. **Text column** (fills the remaining width):
   - Line 1: task name, `body`, `text-primary`, up to 2 lines then ellipsis.
   - Line 2: meta, `meta`, `text-secondary`: `9:00 am · 1h`, or `45 min` if unscheduled.
   - Line 3 (**context line**, when the row appears in Today or Search): `↳ Explain the chapter clearly` in `meta`, `text-secondary`, 1 line. This is the Result it serves and is the main fix for G1.
4. **★ Must:** shown only when on, `must` colour, 48dp tap area. In block detail it's always visible so you can toggle it.
5. **Drag handle:** only on the Block detail Plan list.

Tapping anywhere else on the row opens Task detail.

States to implement:
- **Default.**
- **Completed:** checkmark filled `success`, name struck through, row at 60% opacity. After 1.5s it moves to a collapsed "Completed" section.
- **Overdue:** time in `danger` with the word "Overdue". Don't rely on colour alone.
- **Current:** a task whose time window includes now gets a `surface-2` background and a small "Now" label.
- **Pressed and dragging.**

Completing a task: a short check animation (≤200ms), a light haptic, and a snackbar reading "Task completed · Undo" for 4s.
</details>

<details>
<summary><strong>C2: Block card (used in the Blocks list and Projects)</strong></summary>

This is a summary only. No checkboxes or steppers inside.
- Eyebrow: Area dot + project name, `label`, `text-secondary`.
- **Result** title: `title-card`.
- **Purpose:** `body`, `text-secondary`, 2 lines max, preceded by the word "Why:".
- Progress row: a thin bar (4dp, `accent`, `success` at 100%) and the text `1 of 4 tasks · 1h 50m left`. Use one format everywhere.
- "Next:" row: the first incomplete task in the Plan, as a compact row with a checkbox (so the next step can still be completed from the list).
- Tapping the card opens **Block detail**. Edit lives in Block detail, so no pencil on the card.
</details>

<details>
<summary><strong>C3: Buttons</strong></summary>

- **Primary:** filled `accent`. At most one per screen or sheet.
- **Secondary:** tonal (`surface-2` fill, `text-primary`).
- **Tertiary:** text only, `accent`.
- **Destructive:** text or filled in `danger`. Always placed last or inside an overflow menu, and always confirmed by an Undo snackbar (or a dialog for permanent deletes).
- Height 48dp. Labels are verbs ("Save task", "Mark complete"), never bare "Done" or "OK".
</details>

<details>
<summary><strong>C4: Top app bar, bottom nav, floating button</strong></summary>

- **Top app bar:** screen title (`title-screen`) on the left. Up to 2 icon buttons on the right: 🔍 Search and ⋮ overflow, or ⚙ on Today. Collapses on scroll.
- **Bottom nav:** **solid** `surface-1`, 80dp tall, **4 destinations**, icon plus a label that's always visible, with a pill-shaped active indicator in accent at low opacity. Remove the transparency option from Settings.
- **Floating button:** **one per screen**, an extended button (icon plus label) at the bottom right, 16dp above the nav. It shrinks to icon-only when scrolling down and expands when scrolling up. Its label depends on the screen (see Part 3).
- **Search moves to the top bar.** Delete the Search floating button.
</details>

<details>
<summary><strong>C5: Bottom sheet</strong></summary>

- Drag handle at the top. Title in `title-section`. Close ✕ on the right.
- Swipe down or tap outside to dismiss. If there are unsaved edits, ask "Discard changes?".
- Sticky footer holding the primary action, which stays above the keyboard.
- Hide the header of the screen underneath (or dim it with a 50% scrim) so there aren't two headers.
</details>

<details>
<summary><strong>C6: Chips and filters</strong></summary>

- The first chip is always "All". Chips are 32dp tall with a 48dp tap area, and labels are 20 characters max with ellipsis.
- If there are more than 5 options, replace the chip row with a single dropdown chip: "Project: All ▾" opening a bottom-sheet list.
</details>

### 2.6 Navigation

**Bottom nav, 4 tabs:** `Today` · `Blocks` · `Projects` · `Life`

- The order goes from the zoomed-in day view out to the big picture, which matches the hierarchy.
- **Settings** moves to a ⚙ icon in the Today top bar, and is also listed in the ⋮ overflow on the other tabs.
- **Capture / AI assistant:** opened from a ✦ icon in the top bar on every tab, and from a "Capture" option inside the quick-add sheet. It isn't a tab.
- Hierarchy drill-down (Area → Goal → Project → Block → Task) always pushes a new screen with a back arrow. Content never expands inline more than one level.
- Every detail screen shows a **breadcrumb line** under the title, e.g. `Learning & Growth › Prepare for the new term`, where each part is tappable.

---

## Part 3: Screen specs

<details open>
<summary><strong>S1: Today (highest priority)</strong></summary>

Layout from top to bottom:
1. **Top bar:** "Today" plus the date as a subtitle ("Saturday, September 26"). Icons on the right: ✦ Capture, 🔍, ⚙.
2. **Week strip:** keep it. Add a 4dp dot under each day that has tasks. Selected day uses an `accent` pill, today has an `accent` outline when not selected. Swipe to change weeks.
3. **"Today's results"** (new, the heart of RPM): a horizontal row of up to 3 compact cards, one per Block that has tasks today. Each card shows the Area dot, the Result title (2 lines), and "1 of 4". Tapping one filters the list below to that block, and tapping again clears the filter.
4. **View toggle:** Agenda | Timeline as a segmented control, full width, 40dp tall, placed below the results.
5. **Agenda list**, grouped with section headers in `label` style:
   - **Now & next:** the current or next task, shown larger with its full Purpose line.
   - **Scheduled:** Task rows (C1) in time order, with the context line on.
   - **Must, anytime:** unscheduled tasks marked ★ that are due or linked to today.
   - **Completed (n):** collapsed by default.
6. **Timeline view:** an hourly grid with a red current-time line, tasks as blocks sized by duration, coloured by Area.
7. **Floating button:** "+ Add task", which opens Quick add (S5).
8. **Empty state:** an illustration, the line "Nothing scheduled. What result matters today?", and the buttons [Plan a block] [Add task].

Acceptance: a user can complete a task in one tap, and see which Result that task serves without tapping anything.
</details>

<details>
<summary><strong>S2: Blocks (formerly "RPM") and Block detail</strong></summary>

**Blocks list**
- Top bar: "Blocks" with 🔍 and ⋮.
- Filter: a "Project: All ▾" dropdown chip, plus a "Status: Active ▾" chip (Active / Completed / All).
- A list of Block cards (C2).
- Floating button: "+ New block".
- Empty state: a short explanation of Result / Purpose / Plan with a "Create your first block" button.

**Block detail** (new full screen, where everything removed from the list card goes)
- Top bar: back arrow, breadcrumb (Area › Project), ⋮ menu (Edit, Move to project, Archive, Delete).
- **Result:** `title-screen`, editable when tapped.
- **Purpose:** in a tinted panel (`surface-2`, left bar in the Area colour), labelled "Why this matters", in `body` size. It should be the most emotionally prominent element on the screen.
- **Plan:** section header "Plan · 1 of 4 · 1h 50m left".
  - Task rows (C1) with a drag handle and a ★ toggle that's always visible.
  - A final inline row "+ Add task to plan": typing and pressing enter adds the task at the bottom.
- Completed tasks sink to a collapsed group at the end.
</details>

<details>
<summary><strong>S3: Projects and Project detail</strong></summary>

**Projects list**
- Replace the "Meaningful progress" ring with a one-line stat bar at the top: `3 projects · 3 blocks · 1 of 8 tasks done`, in `meta` style, with no card.
- Filter: an "Area: All ▾" chip. Remove "Outcomes" entirely.
- **Project card:** Area eyebrow, project title (`title-card`), one-line purpose, progress bar plus "1 of 4 tasks", and "1 block" with a chevron. **No nested block cards.**
- Floating button: "+ New project".

**Project detail**
- Breadcrumb (Area › Goal), title, purpose panel, progress.
- A **Blocks** section listing Block cards (C2), each at the first nesting level only, followed by a "+ Add block" row.
</details>

<details>
<summary><strong>S4: Life</strong></summary>

- Top bar: "Life", with a year switcher "‹ 2026 ›" shown as the subtitle.
- Replace the four-option segmented control with **scrollable tabs** below the top bar: Vision · Quarter · Month · Values. Each is a full view with 48dp-tall tab targets.
- **Vision tab:**
  1. **Wheel of Life:** full width (about 280dp), labelled axes with the Area names and scores, segments in Area colours. The average "8.0 / 10" sits below the chart, not beside it. Tapping the chart opens "Rate your areas" (a sheet with one slider per Area, 0–10, where only whole or half steps are allowed).
  2. **Areas list:** one row per Area showing the colour dot, name, score, and "2 goals · 1 project", with a chevron. No nested cards, and remove the duplicate area chips.
- **Area detail** (pushed screen): the area's description, rating (editable), Goals for the year as list rows, and each Goal expanding to show its linked Projects as rows that link to Project detail.
- Floating button on the Vision tab: "+ Add area". Hide it on the other tabs unless they have content to add.
</details>

<details>
<summary><strong>S5: Task detail and Quick add / Task editor</strong></summary>

**Task detail (bottom sheet, expands to full screen when dragged up)**
1. Header row: a large checkbox, then the task title (`title-card`), then ✕.
2. Meta chips (tap each to edit in place): 🕘 9:00 am, Sat Sep 26 · ⏱ 1h · 🔁 Doesn't repeat · ★ Must.
3. **"Part of" context card** (tappable, opens Block detail):
   `Explain the chapter clearly` (Result, `body` semibold)
   `Why: Feel prepared to contribute, with a point of view of my own.` (`text-secondary`)
   `Learning & Growth › Prepare for the new term` (breadcrumb, `meta`)
4. **Notes:** plain text, editable in place.
5. "Original capture": show it **only if it differs from the title**, in a collapsed row.
6. **Sticky footer:** primary **"Mark complete"** (or "Mark incomplete" if already done), plus a ⋮ overflow holding Ask AI, Move to…, Duplicate, Archive, and a divider followed by **Delete** in `danger`.
7. **Remove the "Done" and "Edit task" buttons.** Fields are edited in place, and closing is done with ✕ or a swipe.
8. Use the same date format as the rest of the app.

**Quick add (replaces the long "New task" form)**
- A bottom sheet that opens with the **title field focused and the keyboard up**. Placeholder: "What needs doing?"
- One row of option chips directly above the keyboard:
  `📅 Today ▾` `⏱ 30m ▾` `◧ No block ▾` `★` `🔁` `⋯`
  - Date/time: presets (Today, Tomorrow, Pick…, **No date**) and a time picker.
  - Duration: 15 / 30 / 45 / 60 / 90 / Custom.
  - Block: a searchable list, with the most recently used at the top.
  - ⋯ More: Notes.
- **Remove the task-level Purpose field.** The task inherits its Purpose from its Block. If "No block" is chosen, show an optional "Why? (optional)" field under ⋯.
- Repeat conflicts: show a **single inline warning only when a conflict exists**, e.g. "Clashes with 'Run 5 km' on Tue 29. [See]". Delete the always-visible paragraph.
- The primary button "Add" is disabled until a title is entered. After adding, the sheet stays open with an empty field so users can add several tasks in a row, and shows a snackbar "Added to Today".
- Typed shortcuts (optional, later phase): "tomorrow 9am", "30m", "#block" are parsed into chips as the user types.
</details>

<details>
<summary><strong>S6: Capture / AI assistant</strong></summary>

First, define the job: **"Capture turns messy thoughts into tasks and blocks."** AI chat is how it does that, not a separate product. Every design decision below follows from that sentence.

- **Top bar:** ✕ close, the title "Capture", and a ⋮ menu holding History, Context, Assistant settings, About. **Delete the vertical stack of 8 buttons.** Drop Expand/Minimize, or if the screen is a floating overlay, use a single ⤢ icon in the top bar.
- Remove the unexplained red dot. While the mic is live, show a labelled "● Listening" pill next to the input instead.
- **Empty state:** the prompt "What's on your mind?" sits just **above the input** (not in the middle of the screen), with 3 starter suggestions shown as full-width stacked rows (never truncated): "What's planned today?", "Help me plan a result", "Dump everything on my mind".
- **Input bar:** text field, 🎤 mic, send ↑. All 48dp.
- **Output pattern:** when the assistant pulls out tasks or blocks, it shows **proposal cards** (a Block card or Task rows with checkboxes), each with [Add] / [Edit] / [Dismiss], plus "Add all". Nothing is written to the user's plan without confirmation.
</details>

<details>
<summary><strong>S7: Settings</strong></summary>

- A pushed screen with a back arrow, opened from ⚙. Not a tab.
- Group into sections: **Appearance · Sounds & alerts · Widgets · Account & backup · About**.
- Theme: a single row "Theme: Dark" that opens a dialog with three radio options (System / Light / Dark).
- **Remove "Solid navigation"**, since the nav is now always solid.
- Every row: title (`body`), current value underneath (`meta`, `text-secondary`), a chevron if it opens something, and a switch if it's an on/off setting. **No accent-coloured values.**
</details>

---

## Part 4: Build plan for the engineer

Follow the phases in order. Each phase must pass its checks before the next one starts.

| Phase | Work | Done when |
|---|---|---|
| **0. Foundations** | Build the tokens from 2.4 (colour, type, spacing, shape) as theme values, in dark and light. Add a lint rule or review checklist banning hard-coded values. Rename strings to match the vocabulary in 2.2. | No screen has a hex value or raw sp/dp in its code. A search for "Outcome", "Unsorted", and "RPM block" finds nothing in UI strings. |
| **1. App shell** | 4-tab solid bottom nav, top app bar component, a single floating button per screen with a context label, Search in the top bar, Settings moved behind ⚙, bottom padding on scrollable content. | No floating button ever covers the last list item when scrolled to the end. There's only one floating button per screen. |
| **2. Components** | C1–C6 with every state (default, pressed, disabled, completed, overdue, current, empty, loading as skeleton rows, error). Build a hidden "component gallery" debug screen. | Every state is visible in the gallery, and each component works at 200% font size. |
| **3. Data change** | Merge star, priority, and must into a single Must flag plus order (2.3). Remove the task-level Purpose, with migration: if a task has a Purpose and no block, keep it as "Why"; otherwise append it to notes. | Migration tested on a copy of real data, with no data lost. |
| **4. Today** | S1. | Complete a task in 1 tap. The Result is visible on every task row. The week strip shows dots. |
| **5. Task detail + Quick add** | S5. | Adding a task with a title only takes ≤2 taps plus typing. No button labelled "Done". Delete is last and red, with Undo. |
| **6. Blocks** | S2 list and detail with drag-to-reorder. | The list card has no controls except the Next-task checkbox. At least 2 blocks fit on one phone screen. |
| **7. Projects** | S3. | No card is nested inside another card. |
| **8. Life** | S4, including the rating sheet. | The chart is readable, with labels, at default font size. |
| **9. Capture** | S6. | The overflow menu replaces the 8-button stack. AI output always requires a confirmation tap. |
| **10. Settings** | S7. | |
| **11. QA pass** | Accessibility and polish checklist below. | |

<details>
<summary><strong>Final QA checklist</strong></summary>

- [ ] Every tappable element is at least 48×48dp. Check with Android's Layout Inspector or the Accessibility Scanner app.
- [ ] Text contrast is at least 4.5:1, and at least 3:1 for icons and dividers that carry meaning.
- [ ] At 200% font size, nothing is clipped or overlapping, and the bottom nav labels still show.
- [ ] Every icon-only button has a content description, e.g. "Mark 'Write three discussion points' complete".
- [ ] No information is conveyed by colour alone: overdue has a word, Must has a star shape, Area has a name next to its colour somewhere on the screen.
- [ ] TalkBack reads a task row as: name, time, "part of [Result]", must/not, completed/not.
- [ ] Every destructive action has Undo or a confirmation.
- [ ] Every list has an empty state with a next action.
- [ ] Dark and light themes both checked on every screen.
- [ ] Dates are formatted the same way everywhere (use the system locale formatter).
- [ ] Animations are under 300ms and respect the system "Remove animations" setting.
</details>

---

## The five changes that matter most

If you only do five things, do these:
1. **Add a checkbox and a Result line to every task row in Today.** This delivers the app's core promise.
2. **Keep only one floating button per screen, and move Search to the top bar.** Nothing gets covered any more.
3. **Make list cards summaries only.** Controls move to Block detail, and no card sits inside another card.
4. **Replace star, priority, and "Must do" with a single ★ Must flag plus drag-to-order.**
5. **Rewrite Task detail:** "Mark complete" is the primary action, the "Part of" card shows Result and Purpose, and secondary actions go in an overflow menu.
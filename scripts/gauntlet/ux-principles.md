# UX Principles Brief — Material 3 Android Planner (tasks, projects, weekly review, quick capture)

Researched 2026-10-03. Each principle has a **Rule** a critic can check against a screen or flow.
Tags: [V] = verified in official docs/source, [I] = inferred from docs/reviews/known UI (not stepped through on device).

---

## A. Fewer taps, edit in place

1. **Edit where the object lives.** Rule: renaming, completing, starring, and opening notes on a task happen in the list row or an in-place expanded card. They never need a separate full-screen "Edit" route with a Save button.
   (Things 3 expands the to-do into a card in place while the list fades back; Reminders edits the title inline.) Sources: MacStories, NN/g direct manipulation.
2. **Direct manipulation: physical, incremental, reversible, visible right away.** Rule: every gesture (drag to reorder, swipe to schedule or complete) shows its result while you do it and can be undone. No hidden "apply" step.
3. **One tap for the top 3 row actions.** Rule: complete, star/important and open each take ≤1 tap from the list. Reschedule takes ≤2 interactions (swipe or row affordance, then a preset). Benchmarks: Google Tasks has star on the row [V]. Things and Todoist reschedule with swipe plus preset [V].
4. **Presets before pickers.** Rule: every date entry point offers Today / Tomorrow / This weekend / Next week / No date as one-tap chips. The full calendar picker comes second (Hick's law: fewer, likelier choices).
5. **Parse, don't ask (quick capture).** Rule: the capture field turns natural language into chips as you type ("tomorrow 3pm for 30m #Work p1" sets date, time, duration, project and priority). You can add a dated task in ≤2 taps plus typing (Todoist [V], Reminders [V]).
6. **Progressive disclosure, max 2 levels.** Rule: the task card shows common fields. Rare fields are one tap away in the same surface. Nothing sits ≥3 levels deep, and you never get a sheet stacked on a sheet stacked on a dialog (NN/g: >2 levels hurts usability).
7. **No nested sub-interfaces for single values.** Rule: picking one value (list, priority, duration) uses a menu or chip row anchored to the field, or swaps content inside the same sheet. It does not push a new screen that needs its own Back/Done.
8. **Autosave; no Save/Cancel for edits.** Rule: edits persist when you make them. Dismissing (back, swipe down, tap outside) never throws work away. Undo comes through a snackbar (Raskin: "never use a warning when you mean undo").
9. **Undo over confirm.** Rule: complete, delete, move and reschedule are applied right away with a 4–10 s snackbar "Undo". Confirmation dialogs are only for destructive actions you can't undo (e.g. empty trash). (Nielsen #3 User control and freedom.)
10. **Keep context after an action.** Rule: after you edit, complete or move a task, the list keeps its scroll position and focus. A completed item animates out in place and does not reload the list.
11. **Optimistic UI under 100 ms, everything under 400 ms.** Rule: a tap shows its visual result within 1 frame to 100 ms, and nothing waits on network or disk. Any flow step taking >400 ms shows progress (Doherty threshold; Linear-style local-first sync).
12. **Thumb reach (Fitts).** Rule: primary actions (FAB, capture, sheet buttons) sit in the bottom third. Touch targets are ≥48dp (M3). Destructive actions are kept away from frequent ones.
13. **Absorb complexity (Tesler).** Rule: the app infers defaults (list from current view, date from section such as "Today", time rounded to the next slot). The user only states what differs from the default.
14. **Weekly review is a single pass.** Rule: the review steps through items with inline actions on each card (keep / reschedule chip / move / drop) and never opens a separate editor. Progress shows (n of N). You can quit and resume at any time (staged disclosure, NN/g).
15. **Recognition over recall.** Rule: lists, projects and tags are picked from visible, searchable chips that show recent items first. The user never has to type an exact name from memory (Nielsen #6).
16. **Familiar patterns (Jakob's law).** Rule: use the platform conventions: swipe-to-complete or schedule, long-press then drag to reorder, FAB for add, bottom sheet for detail, predictive back. No novel gestures without a visible affordance.
17. **Consistency of affordances.** Rule: the same field (date chip, priority flag) looks and behaves the same in the list row, the card, capture and review (Nielsen #4).
18. **Error prevention and visibility.** Rule: overdue and conflicting items are visible in the list (color plus icon, not color alone). Pickers can't produce invalid states such as an end time before the start (Nielsen #1, #5).

---

## B. Benchmark tap counts (flow x app)

Counted from the list view with the task visible. Typing isn't counted. A swipe counts as 1 interaction. "back" means a closing tap where the app needs one to leave the detail view.

| Flow | Google Tasks (Android) | Things 3 (iOS) | Todoist (Android) | Apple Reminders (iOS 17–26) | Linear (mobile) |
|---|---|---|---|---|---|
| Open task, change date | 5: tap task, Add date/time, pick day, Done, back [V steps; back I] | 2: swipe right, tap preset [V]. Via card: 3–4 [I] | 2: swipe (Schedule), tap Tomorrow [V swipe action]. Task view: 3 [V] | 3: tap row, calendar icon in quick toolbar, Tomorrow [I]. Via (i): 5 [I] | 3: tap issue, Due date row, pick [I]. Desktop: Shift+D [V] |
| Set time + duration | Time: 5–6 [I]. Duration: no clear support (start time + "time you plan to spend" only) [V text, I UI] | Time-of-day reminder via When: about 4 [I]. No durations | 8 in task view [V, help doc]. 0 extra taps via "tomorrow 13:00 for 30m" in capture [V] | Time: 4–5 [I]. No durations | n/a (estimates are points, not time) |
| Move to list/project | 4: tap task, list name, choose, back [V] | 3: tap to-do, Move, destination [V]. Pull-to-search in dialog [V] | 3: tap task, "Move to…" chip, project [V] | 4–5: tap, (i), List, choose, Done [I] | 3: tap issue, Project, pick [I] |
| Rename | 3: tap task, tap title, back [I] | 2: tap to-do, tap title (edits in place), tap out [I] | 2: tap task, tap name [V] | 1: tap title (inline) [I] | 2–3 [I] |
| Add notes | 3: tap task, Add details, back [V] | 2: tap to-do, Notes field in card [I] | 2: tap task, Description chip [V] | 2: tap row, Notes line [I] | 2–3 [I] |
| Mark important | **1**: star on row [V] | n/a (deadline/tag instead) | 3: tap task, Priority chip, P1 [V]. 0 via "p1" in capture [V] | 2: swipe left, Flag; or tap row, flag in toolbar [V] | 3: priority [I] |
| Complete | **1** (circle) [V] | **1** [V] | **1** (circle) or swipe [V] | **1** [I] | 2–3 (status picker) [I] |
| New task with date | 5: Add task, date icon, pick, Done, Save [I] | 3–4: Magic Plus, calendar, preset, (close) [I]. Drag Magic Plus to place it [V] | **2**: FAB, send, with NL "tomorrow" [V] | 2–3: New Reminder, accept NL date suggestion, done [I]. iOS 26 Control Center popup [V] | 3–4: compose, … menu, due date [V menu; I count] |
| Reorder | Long-press + drag, needs "My order" sort [V] | Long-press + drag [V] | Long-press + drag [I] | Long-press + drag [I] | n/a on mobile (sorted views) [I] |

**Targets for this app (beat or match the best):** reschedule ≤2, complete 1, star 1, move ≤3, rename ≤2, notes ≤2, new dated task ≤2 (with NL), duration ≤3 (preset chips 15/30/60/90 or parsed from "for 30m"), reorder 1 gesture.

---

## C. Motion rules

### Exact M3 tokens [V: androidx `MotionTokens.kt`, MDC-Android Motion.md]
| Token | Value |
|---|---|
| Emphasized | MDC path `M 0,0 C 0.05,0 0.133333,0.06 0.166666,0.4 C 0.208333,0.82 0.25,1 1,1`. Single-bezier fallback (Compose): `cubic-bezier(0.2, 0, 0, 1)` |
| Emphasized decelerate (enter) | `cubic-bezier(0.05, 0.7, 0.1, 1)` |
| Emphasized accelerate (exit) | `cubic-bezier(0.3, 0, 0.8, 0.15)` |
| Standard | `cubic-bezier(0.2, 0, 0, 1)` |
| Standard decelerate | `cubic-bezier(0, 0, 0, 1)` |
| Standard accelerate | `cubic-bezier(0.3, 0, 1, 1)` |
| Linear | `cubic-bezier(0, 0, 1, 1)`, for loops and progress only |
| Legacy (M2) | `0.4,0,0.2,1` / accel `0.4,0,1,1` / decel `0,0,0.2,1` |
| Short1–4 | 50 / 100 / 150 / 200 ms |
| Medium1–4 | 250 / 300 / 350 / 400 ms |
| Long1–4 | 450 / 500 / 550 / 600 ms |
| ExtraLong1–4 | 700 / 800 / 900 / 1000 ms |

**M3 pairings:** Emphasized 500 ms (begins and ends on screen). Emphasized-decelerate 400 ms (enter). Emphasized-accelerate 200 ms (exit). Standard 300 ms. Standard-decelerate 250 ms. Standard-accelerate 200 ms.

**M3 Expressive springs (Compose `MotionScheme`)** [V, androidx source], as damping / stiffness:
- Standard scheme. Spatial: fast 0.9/1400, default 0.9/700, slow 0.9/300. Effects: fast 1.0/3800, default 1.0/1600, slow 1.0/800.
- Expressive scheme. Spatial: fast 0.6/800, default 0.8/380, slow 0.8/200. Effects are the same as standard.
- Use spatial springs for position and size. Use effects springs (damping 1.0, no overshoot) for color and alpha.
- For a utility planner, prefer `MotionScheme.standard()`. Expressive overshoot on every row action gets tiring.

### Transition patterns [V: Material motion docs and codelab]
- **Container transform:** a list row or FAB becomes the task card or capture sheet. Defaults: 300 ms in, 250 ms out.
- **Shared axis:** X for sibling steps (weekly review step n to n+1, week to week). Y for hierarchy. Z for parent to child. Outgoing fades for about 100 ms, incoming fades in over about 200 ms, and both translate 30dp over 300 ms.
- **Fade through:** between unrelated top-level destinations (bottom-nav tabs). Out fades, then in fades plus scale 92% to 100%.
- **Fade:** for in-screen elements such as menus, dialogs and snackbars.

### Predictive back [V: Android design guide]
- Full-screen surface: as the gesture progresses, the exiting screen scales 100% to 90% and the entering screen 110% to 100%. Contents swap at 35% progress using fade through. Releasing before commit springs back.
- Shared-element back: the surface detaches, the max shift is `(width/20) − 8dp`, the minimum scale is 90%, and an 8dp gap to the screen edge is kept.
- Use standard-decelerate `(0,0,0,1)` for progress, and `(0.1, 0.1, 0, 1)` after release to match SystemUI.
- M3 bottom sheets, side sheets and search animate this for free (Compose material3 ≥1.3 / MDC ≥1.10). Don't add a second custom back animation on top.
- Don't hint that items get dismissed in the direction of the back swipe.

### Duration rules (checkable)
- M1. Taps, toggles and checkbox fill: 50–150 ms. Chip select and menus: 150–200 ms. Sheets, dialogs and card expand: 250–400 ms. Full-screen: ≤500 ms. Nothing frequent goes past 300 ms. (NN/g: 100–500 ms; anything ≥500 ms feels like a drag; "far more common to be too long than too short".)
- M2. Exit is shorter than enter (roughly 200 ms out vs 300–400 ms in) and accelerates out. Enter decelerates in. Never use linear for movement.
- M3. Animate size changes to their final layout. Rows below an expanding card or removed row slide (animateItem / animateContentSize). They never jump.
- M4. Frequent actions animate less (HIG: "avoid adding motion to interactions that occur frequently").

### What makes motion feel bad — reject on sight
- **Blocking:** input is disabled until an animation ends. Rule: every animation can be interrupted and redirected and starts from its current on-screen value (WWDC18 Fluid Interfaces). A tap during a transition goes through.
- **Too long:** any routine transition over 400 ms, or staggered list entrances on every visit.
- **Content jumping:** layout shifts after first frame (async data popping in, keyboard pushing a sheet, an item reflowing after completion). Reserve space or animate it.
- **Flashing re-renders:** the whole list cross-fades or flickers when one item changes. Usual causes: unstable keys, AnimatedContent keyed on the whole state, or a loading state flashed for cached data. Rule: only the changed item animates, and cached data never shows a spinner.
- **Scrim flashes:** a scrim snaps to full alpha, or two scrims stack (sheet over dialog), or the scrim fades out after the sheet is already gone. Rule: one scrim, with alpha tied to sheet progress.
- **Double animations:** two systems animate one change (a nav transition plus an in-screen enter, a sheet slide plus a content fade-up, a custom predictive back on an M3 sheet that already has one). Rule: one motion per state change.
- **Motion as the only signal:** respect Reduce Motion / "Remove animations" by swapping to fades or instant changes. State must be readable without the motion (HIG).

---

## D. Laws and heuristics quick reference
- **Fitts:** big, near targets. Bottom-anchored primary actions, ≥48dp, edge swipes for row actions.
- **Hick:** fewer choices at each step. 4–5 date presets, recent projects first, overflow for the rest.
- **Tesler:** complexity that can't be removed goes to the system (smart defaults, NL parsing), not to the user.
- **Doherty (400 ms):** feedback within 400 ms. Optimistic writes, skeletons only on a cold first load.
- **Jakob:** users expect Google Tasks, Todoist and Reminders conventions. Match them, then beat their tap counts.
- **Nielsen:** #1 visibility of status, #3 user control and freedom (undo, cancel predictive back, exit review anywhere), #4 consistency, #5 error prevention, #6 recognition over recall, #7 flexibility and efficiency (swipes and NL as accelerators over visible buttons), #8 minimalist design.
- **Apple's eight principles (WWDC26):** Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, Delight. For this app the ones that matter most: Agency (no locked flows, cheap recovery), Familiarity (borrow existing metaphors), Simplicity (every element earns its place) and Craft (details such as motion polish are design work).

---

## Sources
- M3 easing and duration: https://m3.material.io/styles/motion/easing-and-duration/tokens-specs and https://m3.material.io/styles/motion/easing-and-duration/applying-easing-and-duration
- androidx M3 tokens (source of truth for the values): https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MotionTokens.kt (plus StandardMotionTokens.kt and ExpressiveMotionTokens.kt)
- MDC-Android motion theming: https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md
- Material motion transitions codelab: https://codelabs.developers.google.com/codelabs/material-motion-android and https://m2.material.io/develop/android/theming/motion
- Predictive back design: https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back and https://developer.android.com/develop/ui/compose/system/predictive-back-setup
- Apple HIG Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- WWDC18 Designing Fluid Interfaces: https://developer.apple.com/videos/play/wwdc2018/803/
- WWDC26 Principles of great design: https://developer.apple.com/videos/play/wwdc2026/250/
- NN/g animation duration: https://www.nngroup.com/articles/animation-duration/
- NN/g progressive disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- NN/g direct manipulation: https://www.nngroup.com/articles/direct-manipulation/
- Nielsen 10 heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- Laws of UX: https://lawsofux.com/doherty-threshold/ , https://lawsofux.com/teslers-law/ , https://lawsofux.com/fittss-law/ , https://lawsofux.com/hicks-law/ , https://lawsofux.com/jakobs-law/
- Raskin, Never Use a Warning When You Mean Undo: https://alistapart.com/article/neveruseawarning/
- Google Tasks help (Android): https://support.google.com/tasks/answer/7675838?co=GENIE.Platform%3DAndroid , https://support.google.com/tasks/answer/7675629?co=GENIE.Platform%3DAndroid , stars: https://support.google.com/tasks/answer/12718779?co=GENIE.Platform%3DAndroid
- Things: gestures https://culturedcode.com/things/support/articles/2803582/ , moving https://culturedcode.com/things/support/articles/9651894/ , review https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/
- Todoist: task view https://todoist.com/help/articles/use-the-task-view-to-manage-tasks-in-todoist-eDeRDO0C , duration https://www.todoist.com/help/articles/set-a-task-duration-L1kYkZv8d , swipe actions https://www.todoist.com/help/articles/how-to-change-your-swipe-actions-D5DQOQz6
- Apple Reminders: https://www.macrumors.com/how-to/flag-reminder-on-iphone-ipad/ , https://www.macrumors.com/how-to/create-new-reminder-single-tap-ios/ , quick toolbar https://ios.gadgethacks.com/how-to/use-reminders-new-quick-toolbar-ios-13-add-times-locations-flags-images-tasks-0198848/
- Linear: https://linear.app/mobile , https://linear.app/docs/due-dates

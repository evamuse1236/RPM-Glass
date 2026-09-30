# Purpose-first RPM implementation

Implemented from [brief.md](brief.md) for the Android planner and Capture. Mode: Operate. Root [DESIGN.md](../../DESIGN.md), [PRODUCT.md](../../PRODUCT.md), and [planner-surface-contract.md](../planner-surface-contract.md) now carry the durable current contract. The desktop browser, native home-screen widget, and butterfly launcher retain separate scope.

## What changed

The planner now follows one visible chain: **Area → Goal → Project → Block → Task**, with each Block expressed as **Result · Purpose · Plan**. Four solid destinations—**Today · Blocks · Projects · Life**—move from immediate action to the larger picture. Settings is a pushed screen; Search and Capture moved to top-bar actions; each root screen has one context-specific floating action.

Today adds Result summaries, direct task completion, Agenda/Timeline views, Now & next with full Purpose, Result context on task rows, Must anytime, and recoverable completion. The Timeline uses proportional events and a 72dp ruler. Short or overlapping cards keep the task title first and remove secondary duration/Result text when height is tight. The Now label remains on one line, hides only the nearest hour label within 12 minutes, and stays behind task text.

Blocks and Projects use summaries in lists and controls in details. Block detail makes Purpose prominent and exposes ordered Plan tasks, Must, completion, and reorder handles. Project detail lists first-level Block cards. No current screen nests cards inside cards.

Life uses Vision, Quarter, Month, and Values views. Its default Wheel of Life has labelled Area axes and persistent colors. At 200% text, labelled rating bars replace the fixed SVG labels. Area ratings stay independent of task completion and accept half steps from 0–10.

Task detail keeps completion, meta, Must, notes, differing original capture, and a tappable Part-of panel together. Quick add focuses the title, uses optional date/duration/Block/Must/repeat/More chips, and keeps the Add action above the real Android keyboard. Typed shortcuts remain a later phase and were not implemented.

## Capture and Settings

Capture is now a solid purpose-first overlay: “Capture turns messy thoughts into tasks and blocks.” It has one close control, a single optional expand control, a labelled overflow, three complete stacked starters, and a keyboard-safe composer. Compact mode is capped at 372 × 460dp; enlarged text opens expanded mode. Android system-bar and IME insets size the painted child panel inside its transparent host.

Extracted tasks and Blocks remain reviewed proposals with **Add, Edit, Dismiss, and Add all**. Nothing writes to the Plan without confirmation. Original wording, revisions, atomic operations, and Undo remain intact.

Settings is grouped and pushed above the planner. Navigation is always solid. The ineffective Capture/widget-transparency row and its false success path were retired from current UI and native/model controls; legacy stored preference data is preserved for compatibility. Accurate home-widget text-size and butterfly controls remain.

## Tokens and accessibility

`android-companion/planner-tokens.css` is the single current source for planner/Capture color, type, spacing, shape, control geometry, and motion values. It provides matching semantic light/dark roles, eight persistent Area hues per theme, Jakarta roles from 28/34 down to 12/16, a 4dp rhythm, 16dp cards, 12dp inputs, 24dp sheets, 48dp touch targets, 56/72dp row minima, and 180ms motion.

The implementation uses words and shape as well as color for status. It supports dark/light appearance, 200% Android text reflow, locale dates, system bars, actual IME insets, Android Back, and reduced motion. Component gallery examples are explicitly synthetic.

## Compatibility and migration

`priority` remains the persisted/API field for Plan position so existing Capture, sync, and tool contracts continue to work. It is no longer a separate importance control. The idempotent migration:

- merges legacy star/must into the single Must flag;
- orders tasks by old priority, then time;
- moves an assigned legacy task Purpose into Notes;
- preserves an unassigned legacy Purpose as optional Why;
- preserves raw capture, schedules, alerts, revisions, archived state, and Undo history;
- persists `Area.colorIndex` and retains existing ratings.

Migration was exercised on a read-only copy of the preexisting emulator store containing two entries. This was not the user's physical-phone dataset.

## Main implementation sources

- `android-companion/planner-tokens.css`: semantic light/dark tokens and geometry.
- `android-companion/planner-stitch.css`: planner, detail, Timeline, Life, sheet, and settings layout.
- `android-companion/planner.mjs`, `planner-ux.mjs`, and `planner-state.mjs`: rendering, accessible components, interaction, migration, ordering, persistence, and Undo.
- `android-companion/index.html` and `night.css`: solid Capture shell and reviewed proposal presentation.
- `android-companion/settings.mjs` and native settings/control classes: pushed settings and truthful supported operations.
- `CompanionActivity.java`: trusted asset host, native bridge, compact/expanded panel sizing, system and IME insets, Back, speech handoff, and model boundary.

## Scope kept unchanged

The implementation did not publish, commit, push, install to the personal phone, activate an external integration, perform a live model request, or validate live speech quality. Calendar access remains read-only. The desktop browser and native home widget were not redesigned. The prior pixel-garden and Frosted Night Android surfaces remain historical references rather than current Planner/Capture authority.

Exact test results, screenshots, artifact identity, restoration evidence, and remaining live-device limits are recorded in [verification.md](verification.md).

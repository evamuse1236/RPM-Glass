# Final design, 2026-10-18

Sources: Claude Design project "RPM Design System" (Capture bar, + sheet, notch pill) and a Claude Code session where Fable 5.1 redesigned the Day view. Dara asked to build these into the app. Tokens stay in `android-companion/theme.css` (Google blue, Material 3, Google Sans Flex, Material Symbols Rounded).

## Day view: the spine timeline (Fable) — `day-spine-fable.jpg`

The Day view answers, in order: where am I now; what is next and how soon; what is fixed (calendar) vs mine to move (tasks); where the gaps are that I can plan into; am I keeping up with water, meals and routines.

- **Spine and gutter.** One thin vertical line about 64px from the left. Every item hangs off it with a dot. Its start time and length sit in the gutter ("2 PM / 1 h", label-medium, tabular; bold for the next item). Rows no longer carry the time.
- **Cards: one grammar, two fills.** Task and routine: filled surface-container-low card with the round checkbox (yours). Calendar event: outlined hairline card, no fill, event icon (fixed, not yours). Title first (body-large, never truncated). The supporting line carries one thing: Area dot + Result name; or "Now · until 3 PM", "Not done" (error colour), or "Clash with GWBC session" (error) + Resolve.
- **Routine** keeps a thin progress bar inside its card ("3 of 5 · 1 skipped").
- **Height = length, tamed.** Minimum 56dp; +24dp per extra 30 min past the first; capped at 160dp. A 15-min and a 30-min task look the same; a 1-h event is visibly bigger.
- **Free time is real.** Gaps of 45 min or more render as a dashed spine segment labelled "1 h 30 min free" with faint hour ticks inside it and a quiet + to plan into it. Height 32dp + 8dp per 30 min, capped.
- **Now is the hero.** Blue dot on the spine, a line across the full width when now falls between items, time in the gutter. The item in progress gets the current-row tint (primary-container 55% light / 38% dark) and a thin elapsed bar with "45 min in" / "15 min left" at both ends (same language as the notch).
- **Habits stay small.** Water and meals are compact 40dp spine rows, no card: icon, "Water · 3 of 8", one action (+ or "Log it").
- **Clashes stack**, never side by side at 390px. The task card shows "Clash with <event>" in red + Resolve; the event stays plain. Clash wins over Not done when both apply.
- **Header.** Date line (sticky) and week strip stay. Anytime tasks shrink to one chip line above the spine ("2 anytime tasks ›"). A floating Now button appears when scrolled away from now; the view opens at now.
- Works with large text (200%) and dark mode through the existing tokens.

## Capture: dark bar + "+" sheet (Claude Design) — `capture-bar.jpg`, `capture-plus-sheet.jpg`

- Capture is a **dark floating bar** at the bottom over any app (no header; Back closes it). 28dp corners, small drag handle on top, the typed words in large white text (title-large), a **+** at bottom left and a round filled **Send** (arrow_upward) at bottom right; the mic sits where Send is while empty. Gemini-style.
- **+ opens a dark bottom sheet** rising over a dimmed screen; tapping outside closes it. Top: big rounded tiles that scroll sideways: Photos, Camera, Files, Planner, History, Context, Settings. Below: four two-line rows: "What's planned today?" (Ask about your day), "Plan a Result" (Result, Purpose, then the Plan), "Sort my Inbox" (Place loose tasks into Blocks), "Weekly review" (Look back, then plan next week).
- Stubs: Planner opens the planner. Items not built yet close the sheet and show "<name> isn't built yet" just above the bar. Rows that map to real features run them ("What's planned today?" asks Capture for the day).
- The home-screen widget keeps its own "Capture a thought" pill.

## Notch pill (Claude Design, after Atoll) — `notch-collapsed-split.png`, `notch-expanded.jpg`

Pure black #000, no border or shadow. Collapsed: icon in a grey circle + value ("25m"). Split: a second black circle beside the pill (water due). Expanded: grows out of the top edge, square top with concave ears, 30dp bottom radius; hero row (icon tile, title, "Study · 25 min left"), progress bar with times at both ends, four bare icons (Done, Snooze, Log meal, Ask agent), then at most 3 small rows (next item with time, Water 5 of 8 in blue, Lunch "Not logged" in amber). Accent: task white 60%, water blue, meal amber, agent violet. Details: `docs/wayfinder/whole-day/research/notch-look.md`.

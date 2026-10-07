# Search

Search is a full-screen view where the query lives in the top bar. It finds tasks, Blocks, Projects, Goals and Areas by title, Purpose or notes as the user types, and opens the match. With no query it offers shortcuts to the Inbox and Capture.

## Sub-features

- `search-open` opens search from the top bar.
- `search-shortcuts` shows `Inbox` and `Capture` shortcuts while the query is empty.
- `search-match-tasks` lists matching tasks under `Tasks`.
- `search-match-groups` lists matching Blocks, Projects, Goals and Areas.
- `search-open-result` opens a result.
- `search-empty` shows `No matches` for a query with no results.
- `search-clear` clears the query.
- `search-back` returns to the previous screen.

## How to get to it (user POV)

- Tap the `Search` button in the top bar of Today, Blocks, Projects or Life.
- Tap `Back` or press Android Back to leave search.

## Driving it with rpmctl

Preconditions:

- Baseline state.
- `rpmctl open planner` has been run, on Today.

- **Open.** Run `rpmctl tap --role button --name "Search"`. The top bar becomes a search field named `Search tasks, Blocks, Projects and Goals` with the placeholder `Search tasks, Blocks, Projects`, a `Back` button, and the keyboard opens. Run `rpmctl shot search-empty`.
- **Shortcuts.** With nothing typed the page lists two items: `Inbox` (`Tasks not in a Block yet`) and `Capture` (`Say or type what is on your mind`). Tapping `Inbox` opens the Inbox sheet; tapping `Capture` opens Capture.
- **Task match.** Run `rpmctl type "plagiarism"`. A heading `Tasks` appears with two rows: `Run the plagiarism report and attach it` and `Submit the critical review PDF with the plagiarism report`. Each shows its Block as the supporting text. Run `rpmctl shot search-tasks`.
- **Group match.** Replace the query: run `rpmctl tap --role button --name "Clear search"`, then `rpmctl type "Term 1"`. Headings `Projects` and `Goals` appear, with rows `Term 1 coursework` and `Finish Term 1 with work I am proud of`. A query that matches a Purpose also matches (try `Calm`, then a word from a Purpose such as `submission`).
- **Open a result.** Run `rpmctl tap --role button --name "Term 1 coursework"`. The Project detail opens. Tapping a task result opens the task sheet; a Block result opens the Block detail.
- **Back from a result.** Run `rpmctl tap --role button --name "Back"`. The search screen returns with the last query still in the field (unconfirmed), or Today if the query was cleared.
- **Empty.** Type `volcano`. The page shows `No matches` and `Try another word.`
- **Clear.** Run `rpmctl tap --role button --name "Clear search"`. The field is empty, the shortcuts return, and the clear button is hidden.
- **Leave.** Run `rpmctl tap --role button --name "Back"` or `rpmctl key back`. The root screen returns.
- **Large text.** Run `rpmctl display large-text`, search `RM`, `rpmctl shot search-large-text`, then `rpmctl display phone`. Result rows must wrap without hiding their Block name.
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- The search field is a search input. Its role may be reported as `searchbox` or `textbox` (unconfirmed); omit `--role` and use the name.
- Matching ignores case and looks at title, Purpose and notes. At most 30 results show per group.
- Archived Blocks and completed tasks may be hidden (unconfirmed for completed tasks).
- The keyboard covers the lower results. Scroll with `rpmctl scroll down` or close the keyboard with `rpmctl key back` once before judging a screenshot.
- The query is remembered across openings in the same session (unconfirmed). Clear it before the next recipe.
- Search never changes data, so no reseed is needed.

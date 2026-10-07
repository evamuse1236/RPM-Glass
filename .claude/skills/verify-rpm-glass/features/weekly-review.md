# Weekly review

The weekly review is a four-step flow the user runs once a week. It looks back at last week's Results and asks whether each one happened, empties the user's head into the Inbox, sorts the Inbox into Results, and ends by picking three to five Results for the coming week. Every step can be skipped and nothing blocks Finish.

## Sub-features

- `review-open` opens the review from each entry point.
- `review-steps` shows four steps with Back and Next, and a step bar.
- `review-last-week` asks whether each of last week's Results was Achieved, Partly or Not yet, with an optional line.
- `review-unfinished` offers Carry, Defer or Drop for unfinished tasks.
- `review-empty-head` adds loose thoughts to the Inbox, with one prompt per Area.
- `review-sort-inbox` sorts Inbox tasks into Results, one by one.
- `review-ask-jev` offers `Ask Jev` to sort the Inbox (model-backed).
- `review-pick` picks three to five Results for this week, and marks Musts.
- `review-finish` finishes the review and plans the week.
- `review-close` closes the review and keeps progress.

## How to get to it (user POV)

- Tap the week line on Today (`This week isn't planned, pick 3 to 5 Results. Open weekly review`).
- Tap the lead card `Weekly review` on Today when it is the next task.
- Tap `More options` then `Weekly review` on any root screen.
- Tap `Open Capture` or a Result inside the review to leave and come back (these are exits, not entries).

## Driving it with rpmctl

Preconditions:

- Baseline state. The sample plan has four Results chosen for last week, six Inbox tasks, and no week picked.
- `rpmctl open planner` has been run, on Today.

- **Open from the week line.** Run `rpmctl tap --name "Open weekly review"`. The review fills the screen with a bar titled `Weekly review`, a button `Close review`, a step bar, and a footer. The bottom navigation is hidden. Run `rpmctl shot review-step1`.
- **Open from More.** Run `rpmctl tap --role button --name "More options"` then `rpmctl tap --role menuitem --name "Weekly review"`. The same screen opens.
- **Step bar.** A navigation named `Review steps` has four buttons: `Step 1 of 4: Last week's Results`, `Step 2 of 4: Empty your head`, `Step 3 of 4: Sort the Inbox`, `Step 4 of 4: This week's Results`.
- **Footer.** On step 1 the filled button is named `Next: empty your head`. On later steps there is also a `Back` button. The names change per step: `Next: sort the Inbox`, `Next: pick Results`, and on step 4 `Finish review` or `Finish with 3 Results` (the number follows what is picked).
- **Step 1 verdict.** Each last-week Result shows a radio group named `Did "RM critical review drafted with my group" happen?` with radios `Achieved`, `Partly`, `Not yet`. Run `rpmctl tap --role radio --name "Partly" --nth 0`. The chosen radio shows a check, and a snackbar reads `Marked partly achieved`. Choosing `Achieved` reads `Result achieved`; `Not yet` reads `Marked not achieved yet`. Run `rpmctl shot review-verdict`.
- **Step 1 evidence line.** A field labelled `What made it work? (optional)` with the placeholder `One line to remember next time`. Tap it, `rpmctl type "Started Sunday morning"`, `rpmctl key enter`. Reopen later to see the line kept (unconfirmed where it is stored; look in `rpmctl state files/companion.json` for the text).
- **Step 1 unfinished tasks.** A heading `Unfinished tasks` lists open tasks, each with a group named `What to do with "<task>"` and options `Carry`, `Defer`, `Drop`. A choice saves with a snackbar (unconfirmed wording).
- **Step 2 inbox.** Run `rpmctl tap --role button --name "Next: empty your head"`. The heading is `Empty your head`. A field named `Add to the Inbox` has the placeholder `Ideas, wants, to-dos`. A group named `Prompts, one per Area` has chips such as `Prompt: Studies, anything due, stuck or wanted?`. A button `Open Capture` opens Capture.
- **Step 2 add.** Run `rpmctl tap --role textbox --name "Add to the Inbox"`, `rpmctl type "Renew passport"`, `rpmctl key enter`. The thought appears in a list named `Inbox` below the field. `rpmctl state files/companion.json` has an entry titled `Renew passport` with no Block.
- **Step 3 sort.** Run `rpmctl tap --role button --name "Next: sort the Inbox"`. The heading is `Sort the Inbox`. Lists are named `Inbox tasks to sort`, `Sorted into Results`, `Staying in the Inbox`. Each task shows a chip like `Add "<task>" to <Result>` when a Result matches, `Leave in Inbox`, and a button `Choose a Result for "<task>"` named `Choose`. Tap the `Choose` button: a sheet lists Results and a `New Result` option, plus `Leave in Inbox`. Picking a Result moves the task there. Run `rpmctl shot review-sort`.
- **Ask Jev (keyless).** A text button `Ask Jev` is present when there are Inbox tasks. Without a key it shows the keyless message `Connect your AI key in Settings to get suggestions. Your plans stay saved.` The sorting preview is **UNVERIFIED**.
- **Step 4 pick.** Run `rpmctl tap --role button --name "Next: pick Results"`. The heading is `This week's Results`. A line reads `0 picked · aim for 3 to 5.` Each Result is a checkbox named `Pick "<title>"` with a button `<title>. Show its Purpose and tasks`. Run `rpmctl tap --role checkbox --name "Pick \"DAD Excel workbook submitted\""`, and two more. The line reads `3 picked · aim for 3 to 5.` A button `Open Plan` opens the Block. A row per task reads `Mark as Must: <task>` or `Must. Tap to unmark: <task>`.
- **Pick limit.** The fifth pick is allowed and a sixth is refused (unconfirmed observable).
- **Finish.** Run `rpmctl tap --role button --name "Finish with 3 Results"`. The review closes to Today. A snackbar reads `3 Results for this week`. The week line now reads `3 Results this week, none marked achieved yet. Open weekly review`. Open `Blocks`; the picked Results carry a `Picked for this week` badge. `rpmctl state files/companion.json` shows the three Block ids in the planner's week focus for this week (unconfirmed field name). Run `rpmctl shot review-finished`.
- **Finish with none.** With nothing picked the button reads `Finish review` and the snackbar reads `Weekly review finished`.
- **Close mid-way.** Run `rpmctl tap --role button --name "Close review"` on any step. Today returns. Reopening the review returns to the same step with the same picks (unconfirmed).
- **Calendar parts.** Sections such as `This week at a glance`, `Calendar clashes` and `Which event stays` need calendar data. The emulator has none, so they are **UNVERIFIED**.
- **Large text.** Run `rpmctl display large-text`, repeat steps 1 and 4 with `rpmctl shot review-step1-large-text`, then `rpmctl display max-text`, then `rpmctl display phone`. The footer shows a short `Next` or `Finish` label when the long label does not fit; the aria name stays long.
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- Driven live 2026-10-07 up to step 4 picking: from a fresh seed, step 1 has 2 Results to decide; verdicts are stored in `planner.weeks["<last week's Monday>"].verdicts`; the `What made it work?` line is saved as `evidence` on the Block only after `rpmctl key enter`; Results carried from `Still running` land in `planner.reviews["<this week's Monday>"].focusDraft`; step 2 adds a task with `raw` set and no Block; step 4 picking works (`3 picked`, `Finish with 3 Results`). Finishing the review was not driven.
- The step 1 evidence text box sits under the footer. Run `rpmctl scroll down` first, or the tap lands on `Next`.
- Possible bug, seen once and not yet repeated: after carrying a Result in step 1, adding `Renew passport` in step 2 and filing one task in step 3, tapping `Pick "DAD Excel workbook submitted"` in step 4 left the count at `1 picked`. Evidence: `.verify/evidence/2026-10-07T13-37-30/136-review-pick2.png`, `137-review-pick3.png`.

- The visible footer label can be short (`Next`, `Finish`) while its accessible name is long. Tap by the long name.
- Last week's Results come from the seeded plan. A reseed on another day moves the "last week" window with it.
- Verdict choices change real Block data (achieved or not). Reseed afterwards.
- A radio's name is only its label (`Achieved`), repeated for every Result. Add `--nth` to pick the Result.
- Progress is saved quietly while you move through steps. Only Finish and verdicts show a snackbar.
- The review hides the planner's top bar and bottom navigation. `Close review` and `Back` are the only ways out; Android Back also works (`rpmctl key back`).

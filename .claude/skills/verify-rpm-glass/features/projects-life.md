# Projects and Life

Projects groups related Blocks under a shared Purpose, and Life lifts that up to Goals and Areas of life. The user browses Projects with an Area filter, opens a Project to edit its title and Purpose and add Blocks, and uses the Life tab to see the vision, quarter and month Goals, rate each Area on a Wheel of Life, and keep core values.

## Sub-features

- `projects-list` shows a stat line, an Area filter and a card per Project.
- `projects-filter` filters Projects by Area.
- `projects-new` creates a Project with the `New Project` button.
- `projects-detail` opens a Project with breadcrumbs, title, Purpose, progress and its Blocks.
- `projects-edit` edits the Project title and Purpose in place.
- `projects-add-block` adds a Block to the Project.
- `projects-link-goal` links the Project to a Goal from the breadcrumb.
- `projects-empty` shows the empty state.
- `life-tabs` switches between Vision, Quarter, Month and Values.
- `life-period` moves the period back and forward.
- `life-wheel` shows the Wheel of Life as wedges, rates an Area by dragging its wedge, and lists Area chips.
- `life-area` opens an Area with its rating and Goals.
- `life-goal` opens a Goal with its fields and Projects.
- `life-values` edits the core values.
- `life-new` adds an Area or a Goal.

## How to get to it (user POV)

- Tap `Projects` or `Life` in the bottom navigation bar.
- Tap a Project card, an Area row, or a Goal row.
- Tap a breadcrumb chip on a Block or Goal page to open its Project, Area or Goal.
- Tap `Open Term 1 coursework` in a Block's `Change Project` menu.
- Tap `Add Block` or `Add Project` or `Add Goal` inside a detail page.

## Driving it with rpmctl

Preconditions:

- After `rpmctl launch`, run `export RPMCTL_OWNER=<owner from launch>` in this agent's shell (PowerShell: `$env:RPMCTL_OWNER = '<owner from launch>'`). Keep it set through cleanup.

- Baseline state.
- `rpmctl open planner` has been run.

- **Projects list.** Run `rpmctl tap --role button --name "Projects"`. The heading is `Projects`. A stat line reads `3 Projects · 8 Blocks · N of M tasks done`. A filter button is named `Area: All`. Three cards each have nested rings (one per Block), a button named like `Term 1 coursework, Studies. 5 Blocks · 4 of 18 done. Show Blocks` and a button `Open Term 1 coursework`, plus `Second brain` and `Morning runs`. Tapping `Show Blocks` expands the card in place to one row per Block, named like `RM critical review drafted with my group, 2 of 7 tasks done. Open Block`; tapping the card's button again (now `Hide Blocks`) collapses it. A Block row opens that Block. A button `New Project` floats in the corner. Run `rpmctl shot projects-list`.
- **Filter by Area.** Run `rpmctl tap --role button --name "Area: All"` then `rpmctl tap --role menuitem --name "Health"`. Only `Morning runs` remains and the button reads `Area: Health`. Restore with the same button and `All areas`.
- **Open a Project.** Run `rpmctl tap --role button --name "Open Term 1 coursework"`. The detail page shows a navigation named `Breadcrumb` with chips for the Area (`Studies`) and the Goal (`Finish Term 1 with work I am proud of`), a textbox named `Project` (the title), a textbox named `Purpose`, a progress indicator, a heading `Blocks` with a count, Block cards, and a button `Add Block`. Run `rpmctl shot project-detail`.
- **Edit the title.** Run `rpmctl tap --role textbox --name "Project"`, `rpmctl type " 2026"`, `rpmctl key enter`. A snackbar reads `Project renamed` with `Undo`. `rpmctl state files/companion.json` shows `project-1` with the new title.
- **Edit the Purpose.** Run `rpmctl tap --role textbox --name "Purpose"`, `rpmctl type " Calmly."`, `rpmctl key enter`. A snackbar reads `Purpose saved`; the file shows the new `purpose`.
- **Link a Goal.** Tap the Goal chip in the breadcrumb. A menu lists `Open <Goal>`, the Goals, and `No goal`. Choose `Run three mornings a week`. A snackbar reads `Linked to Run three mornings a week`. Undo restores it.
- **Add Block.** Run `rpmctl tap --role button --name "Add Block"`. A new Block detail opens with its title selected. Type a title and press Enter. Back on the Project it appears in the list.
- **Empty list.** With no Projects, or a filter that matches none, the screen shows `No Projects in this Area` or `Connect your Blocks` with a `New Project` button (reached only by deleting Projects; unconfirmed on the sample plan).
- **Swipe between Projects.** Swiping sideways on a Project detail moves to the next Project. rpmctl has no sideways swipe, so this is **UNVERIFIED**.
- **Life tabs.** Run `rpmctl tap --role button --name "Life"`. The heading is `Life`. A tablist holds tabs `Vision`, `Quarter`, `Month`, `Values`, with `Vision` selected. Run `rpmctl tap --role tab --name "Quarter"`. A period row shows `Quarter 4 · 2026` (for the current quarter) with buttons `Previous period` and `Next period`, and the two Goals are listed. Run `rpmctl shot life-quarter`.
- **Vision and the Wheel.** On `Vision`, a card with the heading `Wheel of Life` and the line `Drag a wedge out or in to rate it from 0 to 10` shows an image named like `Wheel of Life: Studies not rated, Health not rated, …`: one wedge per Area in its colour, rings at 2 to 10, the average in the middle and the names round it. Dragging a wedge out or in sets that Area's rating in whole points; letting go saves it with a snackbar `<Area> rated <n>` and `Undo`. rpmctl cannot drag along a radius, so on the phone the drag is **UNVERIFIED**; the planner page in headless Chromium proves it. A button `Rate your Areas` opens a sheet `Rate your Areas` with one slider per Area named `<Area> rating` and a button `Save ratings` (the keyboard and screen-reader route). A snackbar reads `Ratings saved`. The file shows the Area's `rating`.
- **Areas.** Under the wheel, one chip per Area is a button named `<Area>, rating not set, 1 Goal. Open Area`. Run `rpmctl tap --name "Studies, rating"`. The Area detail shows the rating slider, a heading `Goals · 2026`, goal rows and a button `Add Goal`.
- **Goal.** Open a Goal. The page shows the Area breadcrumb, field buttons named like `<Field>: <value>. Change` (for horizon and year), a heading `Projects`, and a button `Add Project`. Changing the horizon saves with `Goal moved to <Quarter/Month/Vision>`.
- **Values.** Run `rpmctl tap --role tab --name "Values"`. A card shows `Core values` and a button `Edit values`. Tap it to open a sheet, type, and save; the snackbar reads `Context saved`. A `Vision` tab with no Areas shows `What matters to you?` and `Add Area`.
- **New Area or Goal.** The corner button is `Add Area` on Vision and `Add Goal` on Quarter and Month. It is absent on Values.
- **Delete.** In a detail page, `More options` then `Delete` removes the item after a confirmation (unconfirmed wording). `Remove` in the editor leaves its contents unassigned.
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- `Projects` and `Life` also appear in headings and the nav. Always pass `--role button` for the nav.
- The Quarter and Month periods follow today's date. The Goals are placed in Quarter 4 of 2026, so on another date the Quarter tab may be empty until you press `Next period` or `Previous period`.
- `Project` also names the Block page's breadcrumb button (`Project: Term 1 coursework. Change Project`). Pass `--role textbox` for the title.
- The tab names are tabs, not buttons. Use `--role tab`.
- Sliders are hard to drive by touch. Prefer the keyboard keys and read the file afterwards.
- Removing an Area or Project does not delete its contents.
- Reseed after any recipe that changed data.

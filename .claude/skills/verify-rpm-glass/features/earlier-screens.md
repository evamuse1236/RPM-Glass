# Earlier screens

The earlier screens are the original native RPM screens (Next, History, Results, plus their capture, entry, result and settings pages). They are no longer the app's front door. The user reaches them from Settings to see older data or the old planner, and they keep their own storage apart from the new planner.

## Sub-features

- `earlier-open` opens the earlier screens from Settings.
- `earlier-next` shows the `Next` tab: upcoming items, a date line, and the buttons `Remind`, `Settings`, `Check in`, `Capture`.
- `earlier-history` shows the `History` tab with filter chips `All`, `Check-ins`, `Plans`.
- `earlier-results` shows the `Results` tab with the `Add result` button and result cards.
- `earlier-empty` shows the empty states for each tab.
- `earlier-capture` opens the older capture page.
- `earlier-entry` opens an older entry with `Original input` and `Save changes`.
- `earlier-result` opens the older result editor with `Save result`.
- `earlier-settings` opens the older settings page.
- `earlier-back` returns to the new planner Settings.

## How to get to it (user POV)

- In the planner, open `More options`, `Settings`, then the row `Earlier RPM screens` under `Account & backup`.
- There is no other entry. The screen is not exported, so the system cannot start it directly.

## Driving it with rpmctl

Preconditions:

- Baseline state. The sample plan does not populate the old storage, so most tabs are empty.
- `rpmctl open planner` has been run and Settings is open.

- **Open.** Run `rpmctl scroll down` until the `Account & backup` group shows, then `rpmctl tap --name "Earlier RPM screens"`. The status line reads `Opening the earlier RPM screens.` and a native screen opens. Run `rpmctl ui --native` and `rpmctl shot earlier-next`.
- **Next tab.** The screen shows a date line such as `Wednesday, 7 October`, the title `Next`, and, in the bar, icon buttons `Remind` and `Settings`. Bottom buttons `Check in` and `Capture` sit above a navigation of `Next`, `History`, `Results`; the active one is described `Selected`. The empty state reads `Room for your next thought` and `Capture a next step, or check in with how things are going.`
- **History tab.** Run `rpmctl tap --native "History"`. The title reads `History`, with chips `All`, `Check-ins`, `Plans`. Run `rpmctl tap --native "Plans"` to filter. The empty state reads `Your story starts here` and `Your saved plans and check-ins will appear here.`
- **Results tab.** Run `rpmctl tap --native "Results"`. The line `A little direction, when it helps.` and a text button `Add result` show. The empty state reads `What matters to you?` and `Give a result a purpose. Link actions whenever you're ready.`
- **Add result.** Run `rpmctl tap --native "Add result"`. The result editor opens with a `Save result` button. Back out with `rpmctl key back`; saving creates old-storage data and is not needed for this proof.
- **Capture and Check in.** Run `rpmctl tap --native "Capture"`. The older capture page opens; a saved capture shows `Saved` with `Details`, `Choose reminder or alarm` and `Review 30 min estimate` (unconfirmed observable). Back out with `rpmctl key back`. `Check in` opens the same page in check-in mode.
- **Entry rows.** If old entries exist, each row has a content description of the title, kind and time. Tapping a row opens the entry, with `Original input` and `Save changes`. The sample plan has none (unconfirmed), so this is **UNVERIFIED** unless old data is imported.
- **Settings.** Run `rpmctl tap --native "Settings"`. The older settings page opens. Go back with `rpmctl key back`.
- **Return.** Run `rpmctl key back` until the planner Settings screen returns. Run `rpmctl shot earlier-back`.
- **Large text.** Run `rpmctl display large-text`, open the screens, `rpmctl shot earlier-large-text`, then `rpmctl display phone`. In very short windows the bottom navigation switches from stacked to side-by-side labels.
- **Errors.** Run `rpmctl logs --errors`.

## Gotchas

- These are native views. `rpmctl ui` shows the planner WebView, so use `rpmctl ui --native` and `rpmctl tap --native "<text>"`.
- `Capture`, `Settings` and `History` appear in more than one place on these screens. Use `rpmctl ui --native` to find the right one, or tap the bottom nav by its description.
- The earlier screens read their own database, not the data `rpmctl seed` writes. An empty state is expected.
- Creating items here writes to the old database and can import into the new planner later. Do not create items unless the run is about this.
- The earlier alarms and reminders (older alert system) are separate from the new alerts (see the alerts file).
- Reaching the screen from Settings is the only verified path. Do not report it verified from `open planner` alone.

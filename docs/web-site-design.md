# The website runs the phone's planner

Status: chosen 2026-10-22. Replaces the Site's own UI (`web/app/view.mjs`, the old `main.mjs` screens).

## Decision

The Site loads the phone planner (`android-companion/planner.mjs`, the same modules and stylesheets) in the browser. A browser runtime gives it the same small API the phone runtime gives it: `getData`, `getPhone`, `native`, `sortPreview` and `commit(op)`. `commit` sends the op to the phone as one `plan` command. The phone applies it with the same `editPlan(data, op)` a tap uses. The phone stays the only writer.

Two options were compared.

| | A. Grow the Site's own UI | B. Run the phone planner (chosen) |
|---|---|---|
| UI code to write | A second copy of about 50 planner modules (Today spine, task sheet, Blocks, Projects, Life, review, habits, search) | One browser runtime (about 200 lines) and a desktop layout |
| Contract growth | One command type per action, about 40 | One `plan` command carrying the planner's own op |
| Drift | Every phone change needs a second web change | The Site gets each phone change on the next build |
| Prototype | The current Site: about 550 lines for about 15% of the features | `/tmp` sketch: the real planner rendered from `web/fixtures/snapshot.json` with a 20-line runtime and no errors (`.verify/evidence/web-proto-b/01-planner-412.png`, `02-planner-1280.png`) |

## Contract changes

1. **Snapshot v2.** The snapshot carries a store-shaped copy that the planner reads directly: `entries` (plan tasks) and `planner` (blocks, projects, areas, goals, context, weeks, reviews, body, drafts as summaries). It goes through a deep allowlist. Credentials, tokens, traces, model payloads, Undo and conversations never cross.
2. **`plan` command.** `{type: 'plan', args: {op}}`. `op` is one of the allowlisted `editPlan` op types with its JSON shape. Model ops (`aiDraft`, `acceptDraft`) and the planner's own `undo` are not allowed. Browser Undo stays the `undo` command.
3. **Every planner change is a data op.** Today's gap card, body saves with `keepUndo`, and the weekly review commit functions today. Each becomes a named op in `editPlan`. A test fails if planner code commits a function.
4. **Conflicts.** Each op names its targets (task, entity, routine, week). The phone compares those records in the base snapshot and now. A change to a target is a conflict. New records, water and meals are additive.

## Browser runtime

- `getData` returns the snapshot's store plus local pending ops applied with `editPlan`, so a change shows at once.
- A pending change marks its rows "waiting for phone" until the phone applies it and the newer snapshot arrives.
- Undo in the planner's snackbar sends the `undo` command for the last applied `plan` command.
- `native` on the web: haptics and keyboard do nothing; calendar reads say not connected; `capture` opens the Site's Capture; model calls say the AI runs on the phone.
- An op that names a task created in the browser but not yet saved on the phone waits for that save.

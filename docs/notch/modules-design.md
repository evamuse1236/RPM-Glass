# Notch modules: design (2026-10-28)

Chosen design. Base: candidate A (this file). The other candidate (B: numeric weights, five outcome kinds) was rejected; see Synthesis decision. Types and module map: `modules-types.md`.

# Modules describe, one arbiter arranges, acts are data

Shape in one line: **a notch module is one pure Java file that returns an `Offer` (data only: hero, nudge, rows, each control carrying an `Act` record); one pure `NotchArbiter` ranks all offers into a `Scene`; the renderer and controller know a closed vocabulary of parts and four act kinds, never a module kind.**

## Problem

The notch's content is a hand-synced list of four kinds (task/event, water, meal, routine) spread over `NotchScene` (one 120-line constructor), `Look`/`Control` enums, `NotchContent` per-kind row branches, the 17-method `NotchContent.Actions`, `NotchHabits.Habit`, `NotchSnooze`, `NotchFrame.spoken/opens`, `NotchBand.icon/markColor/markIcon`, `NotchInk.accent`, and `NotchController.onGesture/holdDrop/snoozePill`. `NotchScene.key()` is itself a hand list of fields: a field added to the face but not to `key()` draws stale. Constraints to keep: every row in `docs/rules/notch.md` (two drops max, one hero, one primary, 3 rows + "+N more", due water never drops, alert rows, receipts with 5 s Undo through `notch-actions.js`, redraw only on change), plain Java 17 (AGP 8.13: records and sealed interfaces are available), JUnit in `app/src/test`, and the playground JS copy.

## Usage first: adding a module

An agent adds a module by writing **one file** in `app/src/main/java/com/rpm/prototype/notch/` and **one line** in `NotchModules.ALL`. Nothing else names it. The full Focus timer:

```java
package com.rpm.prototype.notch;

import com.rpm.prototype.R;

/**
 * A focus timer: Start from its row, Pause or Resume as the hero's one control, End from its own row.
 * State lives in this module's notch-local store (start, length, paused-at, paused total, all wall-clock ms),
 * so a service restart recomputes the same time left. Nothing here touches the planner store.
 */
final class FocusTimer implements NotchModule {
    static final Look LOOK = new Look(R.drawable.notch_ic_focus, Ink.FOCUS);
    private static final int DEFAULT_MINUTES = 25;

    @Override public String id() { return "focus"; }

    @Override public Offer offer(Inputs in) {
        Focus f = Focus.of(in.local());
        if (f == null) {
            int len = (int) in.local().getLong("length", DEFAULT_MINUTES);
            return Offer.none().row(Row.filler(LOOK, "Focus", "Start a " + len + " minute focus",
                    Act.local(this, "start", null), List.of(Trail.value(len + "m")),
                    Circle.of(R.drawable.notch_ic_play, LOOK.accent(), "Start focus", Act.local(this, "start", null))));
        }
        long left = f.leftAt(in.now());
        boolean over = left <= 0;
        Control primary = over ? Control.of(R.drawable.ic_check, "End", "End focus", Act.local(this, "end", ended(f)))
                : f.paused() ? Control.of(R.drawable.notch_ic_play, "Resume", "Resume focus", Act.local(this, "resume", null))
                : Control.of(R.drawable.notch_ic_pause, "Pause", "Pause focus", Act.local(this, "pause", null));
        Row end = Row.attached(LOOK, "End focus", "End focus now", Act.local(this, "end", ended(f)),
                Circle.of(R.drawable.notch_ic_stop, Ink.WHITE_87, "End focus", Act.local(this, "end", ended(f))));
        Hero hero = Hero.builder(Urgency.RUNNING, f.start(), LOOK, "Focus")
                .line(over ? "Time's up" : f.paused() ? "Paused" : "Focus")
                .ring(f.permilleAt(in.now()), over ? "0m" : in.minutes(left))
                .spoken("Focus, " + (over ? "time is up" : in.spoken(left) + " left"))
                .primary(primary).open(Act.open(PlannerTarget.day())).drop(Art.capsule(Art.NEUTRAL, LOOK.icon()))
                .attached(over ? List.of() : List.of(end)).build();
        return Offer.none().hero(hero);
    }

    /** Applied when tapped, with that moment's clock, so a stale render never writes a stale time. */
    @Override public LocalState apply(String verb, Inputs in) {
        Focus f = Focus.of(in.local());
        long now = in.now();
        switch (verb) {
            case "start": return Focus.start(now, (int) in.local().getLong("length", DEFAULT_MINUTES)).state(in.local());
            case "pause": return f == null || f.paused() ? in.local() : f.pause(now).state(in.local());
            case "resume": return f == null || !f.paused() ? in.local() : f.resume(now).state(in.local());
            case "end": return in.local().without(Focus.KEYS);
            default: throw new IllegalArgumentException("focus has no verb " + verb);
        }
    }

    private static ReceiptSpec ended(Focus f) {
        return ReceiptSpec.of(LOOK, "Focus ended", f.lengthMinutes() + " min", 1f, 1f);
    }

    /** start, length, pausedAt (0 = running), pausedMs: every derived value is a pure function of these and now. */
    record Focus(long start, int lengthMinutes, long pausedAt, long pausedMs) {
        static final List<String> KEYS = List.of("start", "pausedAt", "pausedMs");
        static Focus of(LocalState s) { throw new UnsupportedOperationException("not implemented"); }
        static Focus start(long now, int minutes) { throw new UnsupportedOperationException("not implemented"); }
        boolean paused() { return pausedAt > 0; }
        long leftAt(long now) { throw new UnsupportedOperationException("not implemented"); }
        int permilleAt(long now) { throw new UnsupportedOperationException("not implemented"); }
        Focus pause(long now) { throw new UnsupportedOperationException("not implemented"); }
        Focus resume(long now) { throw new UnsupportedOperationException("not implemented"); }
        LocalState state(LocalState base) { throw new UnsupportedOperationException("not implemented"); }
    }
}
```

Registry line (the order **is** the priority; see Ranking):

```java
static final List<NotchModule> ALL = List.of(new FocusTimer(), new Tasks(), new Calendar(), new Routines(), new Water(), new Meals());
```

Its test is plain JUnit with no Android: `NotchModules.offer(new FocusTimer(), inputsAt("10:00").local("start", t0))` then assert on `hero().ring()`, and `apply("pause", ...)` twice gives the same state (idempotent verbs).

Two more call sites, to show the runtime side stays kind-free:

```java
// NotchController: the 17-method Actions interface becomes this one method.
void perform(Act act) {
    if (act instanceof Act.Save s) changes.save(s.request(), s.receipt());
    else if (act instanceof Act.Local l) changes.local(modules.apply(l, inputs()), l);   // writes LocalStore, receipt + local Undo, or a note
    else if (act instanceof Act.Open o) { state.close(); NotchActions.open(service, o.target()); render(); }
    else if (act instanceof Act.ManageAlert m) { state.manage(Managed.of(m)); render(); }
}

// NotchContent: one row renderer for every module.
View row(Row r) {
    LinearLayout v = parts.row(r.look().icon(), r.tint(), r.title(), r.spoken(), r.tap() == null ? null : () -> act.accept(r.tap()));
    for (Trail t : r.trail()) NotchParts.trail(v, t.accept(trailViews), gap);
    if (r.circle() != null) parts.trailCircle(v, parts.rowCircle(r.circle().icon(), r.circle().tint(), r.circle().spoken(), () -> act.accept(r.circle().act())));
    return v;
}
```

## Shape

The type sketch, the focus timer's state and the module map are in [modules-types.md](modules-types.md).

## Ranking (all in `NotchArbiter`, pure, one file)

1. **Hero** (drop before the camera, the band, the hero island). Among offers with a hero: a `RUNNING` hero beats an `UPCOMING` one. Among running heroes, **registry order** decides (Focus > Tasks > Calendar: an explicit focus outranks a running task, which outranks a running event, as today). Among upcoming heroes, the **soonest `at`** wins, ties by registry order (today's "next to start"). A losing hero's `asRow` joins the timed rows.
2. **Nudge drop** (after the camera, the nudge island). The first offer in **registry order** with a `nudge`. Water is listed before Meals, so due water wins, as `fixtures/habit-cases.json` `top` says. A module offers a nudge only while it is due and not snoozed; snoozes are its own local state.
3. **Rows** (hero island). Build `soon + nudges + later`:
   - `soon` = the first timed row, preceded by the first `alerting` timed row when that is a different row (today's "next alert row first").
   - `nudges` = `NUDGE` rows in registry order (Routines, Water, Meals: today's order).
   - `later` = the remaining `TIMED` rows by `at`, across modules (tasks and events interleave by time).
   - Every `due` row moves to index 1 (today's water rule, now generic: "a due row comes right after the first").
   - `visible(n)` = the winning hero's `attached` rows, then the rows above; while it holds more than `n`, it removes the last row that is not `due`. `FILLER` rows fill free space only and never count in "+N more".
4. **"Water due stays visible"** is the generic `due` flag: a `due` row moves up and is never dropped. Water sets `due` when `status.pending`. One flag replaces `Look.WATER` checks in `visibleRows` and the hand reorder loop.
5. **Pill gestures:** tap on a side opens that side's island; long press runs `hero.open` or `nudge.hold`; swipe up/left/right runs `nudge.later.act`. The controller has no kind checks.

Deliberate change: today a running calendar event that started before a running task is hidden. Here it shows as a timed row via `asRow`. Every other order is today's, and step 3 below proves it with a parity test.

## Actions and receipts without a growing interface

- The renderer hands every tap to one `Consumer<Act>`. The controller's `perform` has four branches, closed by the sealed `Act`.
- `Save` → `NotchChanges.save(request, receipt)`: shows the receipt at once, runs the request through `NotchRunner`, and on success shows `receipt.saved(token, request.savedDetail(...))` with 5 s Undo. Undo sends `PlannerRequest.Undo(token)`. The JSON wire form lives only in `NotchChanges` (per boundary-discipline).
- `Local` → `NotchModules.apply(act, inputs at tap time)` gets the module's next `LocalState`. `LocalStore` writes it and keeps the previous state. If the act has a receipt, it shows with an instant local Undo (restore the previous state). If it has a note ("+15m"), the note shows on the pill.
- A new planner op adds one `PlannerRequest` record and one branch in `notch-ops.mjs`. `PlannerRequestTest` reads the `action === "…"` names from `notch-ops.mjs` and fails when the two lists differ.
- Alert islands (Reminder, Alarm, Manage) keep their own controls, but their Done and alert changes become `Act.Save(new Done(..., near=true), ...)` and `Act.Save(new SetAlert(...))`. `doneAt` and `setAlert` disappear as separate paths.

## Enforcers (rule → test)

| Rule | Enforced by |
|---|---|
| A module is pure: no `android.*` import except `R` | `NotchModulesTest.modulesImportNoAndroid` (source scan) |
| Module ids are unique, lowercase and never reused | `NotchModulesTest.idsAreUniqueAndStable` (also checks `fixtures/notch-module-ids.json`, append-only) |
| One module's exception never blanks the notch | `NotchModulesTest.aThrowingModuleIsLeftOutAndTheRestShow` |
| Every Java module has a playground copy and both agree | `playground/notch-scene.test.mjs` over `fixtures/notch-cases.json`, which `NotchArbiterTest` also runs |
| `PlannerRequest` matches `runNotchRequest` actions | `PlannerRequestTest.matchesNotchOps` |
| A `Local` verb applied twice gives the same state | `NotchModulesTest.localVerbsAreIdempotent` (runs every verb of every module twice) |
| Redraw only on change, now derived | existing `NotchFrameTest`/`IslandWindowTest`, plus `SceneTest.equalInputsGiveEqualScenes` |

## Migration (each step ends with `npm test` green; native steps also run `rpmctl launch --build` and the `notch-glass` drive)

1. **Probe the toolchain.** Add one record, one sealed interface and its JUnit test under `notch/`. Build the debug APK to prove D8 dexes them. If sealed fails, use abstract classes with private constructors; nothing else changes.
2. **Move domain code.** Move `NotchDay`, `NotchBody`, `NotchWater`, `NotchHabits` into `com.rpm.prototype.notch` with the needed members `public`. Move their tests. Pure move, no logic change.
3. **Contract plus parity.** Add the API types, `NotchArbiter`, `NotchModules`, and Tasks, Calendar, Routines, Water, Meals as modules over the moved rules. Add `ScenesParityTest`: for every fixture in `NotchSceneTest` and `NotchAlertRowsTest`, compare old `NotchScene` (hero, drops, visible rows for n = 0..3, `more`) with the new `Scene`. Nothing is wired yet. Any difference is either fixed or written as an approved deliberate change.
4. **Switch the views.** `NotchFrame` holds `Scene`; `NotchContent` and `NotchNudgeViews` render specs; `NotchBand` and `NotchInk` switches are deleted; `key()` is derived. `Actions` stays for one step through an adapter that maps each method to an `Act`.
5. **Switch actions.** Add `perform(Act)`, delete `NotchContent.Actions` and the adapter, and convert `onGesture`/`holdDrop`/`snoozePill`. Add `LocalStore` and move snoozes into module local state. Old `snooze:*` keys are ignored, so at most one snooze is lost on upgrade. Delete `NotchSnooze`.
6. **Receipts.** `NotchReceipt` takes a `ReceiptSpec`; `NotchChanges` collapses to `save` and `local`; add `PlannerRequestTest`.
7. **Delete `NotchScene`** and the parity test; port the remaining `NotchSceneTest` assertions to `SceneTest`. Mirror the arbiter and modules in the playground; add `fixtures/notch-cases.json` to both test suites.
8. **Add `FocusTimer`**: one file, one registry line, `FocusTimerTest`, one playground copy, and icons `notch_ic_focus`, `notch_ic_play`, `notch_ic_pause`. Drive it on the emulator: start, pause, kill the service, reconnect, resume, end, Undo.
9. **Calendar "next event".** Add the countdown chip ("in 12m") on the next event row. Decide whether that row is `due` (see open questions).

Then update `docs/rules/notch.md` and the `AGENTS.md` rule table with the enforcer rows above.

## Tradeoffs accepted

- We accept a closed parts vocabulary (a truly new visual needs one renderer case) in exchange for modules that never touch views and a renderer with no kind branches.
- We accept `Act.Local` verbs as strings in exchange for acts that are data, so the redraw key derives from record equality. `localVerbsAreIdempotent` runs every verb a module answers.
- We accept a one-time package move in exchange for a compile-time wall between modules and views.
- We accept a focus that is invisible to the planner and website in exchange for no planner schema, no sync and no write race.
- We accept that a losing running event now shows as a row. That small change keeps the arbiter's rule general.

## Alternatives considered

- **Modules that build their own Views** (`View row(Context)`, `void onTap()`): each module is self-contained, but it imports `NotchParts` and the geometry rules. The 16dp/40dp/concentric rules then spread across every module, and the redraw key cannot be derived because a View has no equality. This exposes the whole visual system to every module and hides nothing.
- **Numeric priorities on every offer** (`priority = 80`): flexible, but every module must know every other's number, which is a hand-synced list in disguise. Registry order plus two time rules says the same with no numbers.
- **Keep `NotchScene`, add a `Kind` interface per row:** smaller change, but hero, drop and ranking logic stay in one constructor that each new kind edits. This is the problem we have now.

## Open questions and risks

- Should a running focus beat a running task for the hero, or should a focus started on a task show that task's title and Done? This design picks focus first, with the title "Focus" and no task link.
- Should idle Focus offer a `FILLER` "Focus 25m" start row, or should a focus start only from the planner or a long press?
- When focus time runs out with the screen off, nothing rings. Should `FocusTimer` schedule a `CompanionAlerts` reminder at its end?
- Should the next calendar event be `due` (kept and moved up) so the 3-row cap never hides it?
- Can `playground/notch-modules/*.mjs` copies stay small, or should the playground render Scene JSON exported by a JUnit run instead of recomputing it?

## Next implementation step

Step 1: add the record and sealed-interface probe under `notch/` and build the APK to confirm D8 accepts both.

## Synthesis decision

- **Base: A.** Registry order plus two time rules ranks the hero, the drops and the rows. B's numeric weights would make each module know every other module's number, and B reorders rows against a written rule. A keeps today's row order.
- **Grafted from B.** (1) `NotchModulesContractTest`: every module in `NotchModules.ALL` has a fixture, a unique id and unique items. Every `Act` it offers resolves, and every local verb is idempotent. (2) `scripts/rules/notch-modules.test.mjs`: every file that implements `NotchModule` is in the registry, and no file outside `notch/` names a module class. (3) One op table. `notch-ops.mjs` turns its switch into an `OPS` table, and `fixtures/notch-ops.json` lists the op names that both Java and JS test against. (4) A `wakeAt` on an offer, so the controller redraws at the minute a focus or countdown changes, not on every tick.
- **Rejected from B.** Numeric weights, and B's rewording of the row order.

## Decisions on the open questions (owner may override)

- A running focus beats a running task for the hero. A person who starts a focus means it.
- Idle focus offers a FILLER "Focus 25m" start row. FILLER rows show only when the 3-row cap has room.
- At the end, `FocusTimer` schedules one reminder through the existing alert path, so the end is heard with the screen off.
- The next calendar event is not `due`. Its countdown chip shows on its row when the row fits.
- The playground keeps copying only geometry and gestures. Showing Scene JSON exported by the Java tests is a follow-up in `BACKLOG.md`.

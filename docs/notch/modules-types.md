# Notch modules: types and module map

Part of [modules-design.md](modules-design.md).

## Shape

### Data structures (package `com.rpm.prototype.notch`, public types only where the renderer needs them)

```java
public interface NotchModule {
    /** Stable lowercase id. Namespaces local state, logs and acts. Never reused. */
    String id();
    /** Pure. Called every render. No I/O, no Android, no clock other than in.now(). */
    Offer offer(Inputs in);
    /** A Local act's verb, run at tap time on fresh inputs; returns this module's whole next local state. */
    default LocalState apply(String verb, Inputs in) { throw new IllegalArgumentException(id() + " has no verb " + verb); }
}

/** What every module reads. Shared parts are immutable; local() is this module's own namespace only. */
public final class Inputs {
    public long now();  public ZoneId zone();  public boolean h24();
    public List<PlanTask> tasks();        // open timed planner tasks (no calendar events: the `fixed` flag is gone)
    public List<CalendarEvent> events();  // today's commitments; busy() feeds water's pause
    public NotchBody body();
    public LocalState local();
    public String clock(long at); public String shortClock(long at); public String minutes(long ms); public String spoken(long ms);
}

/** One module's notch-local state: flat string map, persisted as one JSON value per module. */
public record LocalState(Map<String, String> values) {
    public long getLong(String k, long fallback); public LocalState with(String k, Object v); public LocalState without(List<String> keys);
}

public final class Offer {                       // builder; immutable once returned
    public static Offer none();
    public Offer hero(Hero h);                   // at most one
    public Offer nudge(Nudge n);                 // at most one: a candidate for the drop after the camera
    public Offer row(Row r);                     // any number
}

public enum Urgency { RUNNING, UPCOMING }
public record Hero(Urgency urgency, long at, Look look, String title, String line, int ringPermille, String value,
                   String spoken, String barSpoken, Control primary /* null: none, never greyed */, Act open, Art drop,
                   List<Row> attached /* shown first, only while this hero wins */, Row asRow /* shown when it loses */) {}
public record Nudge(Meter meter, String line, String spoken, Control primary, Control later, Act hold) {}
public record Row(Place place, long at, boolean alerting, boolean due, Look look, String title, String spoken,
                  Act tap, List<Trail> trail, Circle circle) {}
public enum Place { ATTACHED, TIMED, NUDGE, FILLER }

public record Look(int icon, int accent) {}
public record Control(int icon, String label, String spoken, Act act) {}
public record Circle(int icon, int tint, String spoken, Act act) {}
public sealed interface Trail { record Value(String text, int color) implements Trail {} record Dots(int count, int goal) implements Trail {}
                                record AlertChip(String alert, String at) implements Trail {}  <T> T accept(Visitor<T> v); }
public sealed interface Meter { record Water(int goal, int count) implements Meter {} record Meals(List<String> slots, List<Integer> logged) implements Meter {}
                                record Ring(int permille, int accent) implements Meter {}  <T> T accept(Visitor<T> v); }
public sealed interface Art   { int NEUTRAL = -1; record Capsule(int tone, int icon) implements Art {} record Gauge(Meter meter) implements Art {} }
public record ReceiptSpec(Look look, String title, String detail, float from, float to, Meter meter /* null: band ring */) {}

/** Everything a tap can do. Data, so a Scene compares by equals and the redraw key derives itself. */
public sealed interface Act {
    record Save(PlannerRequest request, ReceiptSpec receipt) implements Act {}      // planner op via notch-actions.js, 5 s Undo
    record Local(String module, String verb, ReceiptSpec receipt, String note) implements Act {} // module-local state, local Undo
    record Open(PlannerTarget target) implements Act {}                              // opens the planner
    record ManageAlert(long taskId, long start, String alert, String title, String at) implements Act {}
    static Local local(NotchModule m, String verb, ReceiptSpec receipt) { return new Local(m.id(), verb, receipt, null); }
}

/** The notch's planner ops; mirrors runNotchRequest in android-companion/notch-ops.mjs (a test keeps the two lists equal). */
public sealed interface PlannerRequest {
    record Drink() implements PlannerRequest {}
    record Done(long id, long start, boolean repeats, boolean near) implements PlannerRequest {}
    record SetAlert(long id, String type) implements PlannerRequest {}
    record Undo(String token) implements PlannerRequest {}
    /** The receipt's detail once saved ("4 of 8 today"); null keeps the guessed one. JSON stays private to NotchChanges. */
    default String savedDetail(int count, int goal) { return null; }
}
public record PlannerTarget(String view, String slot, long id) { public static PlannerTarget day(); task(long id); water(); meal(String slot); }

/** What the island draws. A record: two equal Scenes draw the same pixels, so NotchFrame.key() is face.toString() + place. */
public record Scene(Owned<Hero> hero, Owned<Nudge> nudge, List<Row> rows, List<String> failed) {
    public List<Row> visible(int n);   // attached rows, then rows; drops to n (see Ranking)
    public int more(int n);            // non-filler candidates left out
}
public record Owned<T>(String module, T value) {}

public final class NotchModules {
    public static final List<NotchModule> ALL = List.of(/* see registry line */);
    /** Calls every module, isolates a throwing one (logged in Scene.failed, the rest still show), then arranges. */
    public static Scene scene(Inputs.Shared shared, Map<String, LocalState> local) { throw new UnsupportedOperationException("not implemented"); }
    public static LocalState apply(Act.Local act, Inputs.Shared shared, Map<String, LocalState> local) { throw new UnsupportedOperationException("not implemented"); }
}
final class NotchArbiter {   // pure, package-private; NotchModules is its only caller
    static Scene arrange(List<Owned<Offer>> offersInRegistryOrder) { throw new UnsupportedOperationException("not implemented"); }
}
```

Load-bearing decisions:

- **Modules are pure describers** (per boundary-discipline). One required method, `offer`. Android lives only in `LocalStore`, the renderer and the controller. A source test fails the build if a `NotchModule` file imports `android.*` (except `R`).
- **Acts are data, not `Runnable`s.** This kills the growing `Actions` interface (four act kinds forever) and makes every spec a record. So **`key()` is derived**: `NotchFrame.key(place) = face.toString() + "|" + place`. No hand list of fields (per single source of truth). Ring progress is an int permille from a minute-floored `now`, so a Scene changes only when a drawn value changes.
- **Closed parts, open modules.** `Trail`, `Meter`, `Art` are sealed with a visitor. A new visual primitive adds a visitor method, so every renderer fails to compile until it draws it. A new module that reuses parts touches no renderer.
- **Per-module local state** replaces `snooze:*` prefs, `NotchSnooze`, `WATER_SNOOZE`, `mealSnooze`, `routineSnooze` and the controller's `snoozes()`. `LocalStore` is its one writer (per split-ownership). A module reads only its own namespace (`in.local()`); `Act.Local` carries the module id from `Act.local(this, …)`.
- **Package boundary.** Modules and their domain code (`NotchDay`, `NotchWater` rules, `NotchHabits` rules, `NotchBody`) move into `com.rpm.prototype.notch`. Views and controller stay in `com.rpm.prototype` and see only the public spec types. A module cannot call `NotchParts` or the controller: the import fails.
- **Reliability:** a module that throws is left out of that render and logged; the other modules still show. Today one exception in `NotchScene` blanks every kind.

### Focus timer state: notch-local, not the planner store

It lives in `LocalStore` (SharedPreferences `notch`, key `m:focus`, one JSON object, written with `commit()` on the reader thread). Reasons: (1) one writer, the notch service, so no version race with the planner and no `notch-actions.js` op to add; (2) only wall-clock timestamps are stored, and time left is derived, so a restart, a reboot or a double `apply` gives the same answer (per make-operations-idempotent); (3) a focus session is not plan content: it is not a task, result or commitment in `CONTEXT.md`, so it should not add planner schema, sync or Undo history. Its Undo is local: `NotchChanges.local` keeps the previous `LocalState` for 5 s and restores it. Cost: the planner and the website cannot see a running focus. If that becomes a need, promote it to the store then; the module's interface does not change, only where `LocalState` comes from.

## Module map

| File | Fate | Owns |
|---|---|---|
| `notch/NotchModule.java`, `Inputs.java`, `LocalState.java`, `Offer.java`, `Parts.java` (Look, Control, Circle, Trail, Meter, Art, ReceiptSpec), `Act.java`, `PlannerRequest.java`, `PlannerTarget.java`, `Scene.java` | new | The module contract and the closed parts vocabulary |
| `notch/NotchModules.java` | new | The one list, module isolation, `apply` routing |
| `notch/NotchArbiter.java` | new | Every cross-module ranking rule (below). The only place ranking lives |
| `notch/Tasks.java` | new, from `NotchScene` hero/rows/alert parts | Task hero, Done, alert rows and chips, later task rows |
| `notch/Calendar.java` | new, from `NotchData` events + `fixed` branches | Event hero (no primary, neutral tone), event rows, "next event" countdown chip |
| `notch/Water.java` | new, absorbs `NotchWater` | Water row (due flag), water nudge (meter, Glass, Later), snooze in local state |
| `notch/Meals.java`, `notch/Routines.java` | new, split from `NotchHabits` | Meal nudge and row; routine row and its snooze |
| `notch/FocusTimer.java` | new | Above |
| `notch/NotchDay.java`, `NotchBody.java` | moved | Occurrences and the Body parse; `Task.fixed` deleted |
| `NotchScene.java`, `NotchSnooze.java` | deleted | |
| `NotchContent.java` | shrinks to a generic panel + `row(Row)`; `Actions` deleted, uses `Consumer<Act>` | |
| `NotchHabitViews.java` → `NotchNudgeViews.java` | renders any `Nudge` via the `Meter` visitor | |
| `NotchFrame.java` | `scene` is `Scene`; `taskDrop/habitDrop/opens/spoken/taskKey/dropTone/dropIcon` read `hero().drop()` and `nudge()`; `key()` derived | |
| `NotchController.java` | 17-method anon class → `perform(Act)`; `holdDrop/snoozePill/openDrop` read the drop's acts; `snoozes()` → `LocalStore.all()` | |
| `NotchChanges.java` | `drink/done/doneAt/setAlert` → `save(PlannerRequest, ReceiptSpec)` + `local(...)` | |
| `NotchReceipt.java` | built from `ReceiptSpec`; `mark` string → `Look` + optional `Meter` | |
| `NotchBand.java`, `NotchInk.java` | `icon(Look)`, `accent(Look)`, `markColor`, `markIcon` switches deleted | |
| `NotchActions.java` | `logMeal/openWater/openTask` → `open(PlannerTarget)` | |
| `IslandState.java` | `habit` boolean → `Side opened` (BEFORE opens the hero island, AFTER the nudge's) | |
| `NotchData.java` | parses into `Inputs.Shared` (tasks, events, body) | |
| `NotchAlerting`, alert islands, `NotchPill` geometry, `Island*` | unchanged (alerts are a mode, not a module) | |
| `playground/notch-scene.mjs` | mirrors `NotchArbiter`; modules mirrored one file each in `playground/notch-modules/` | |


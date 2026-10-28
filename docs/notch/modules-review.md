# Notch modules: review changes (2026-10-28)

A fresh-context review of [modules-design.md](modules-design.md) found 3 blockers and 9 smaller issues. These decisions override the design and [modules-types.md](modules-types.md) where they disagree.

## Blockers

1. **One key per mode, not one key for the scene.** The pill keys on each drop's module, art and start, and the nudge's meter. It never keys on the ring, the time left or the spoken text, so `thePillRedrawsOnlyWhenADropChangesNotEachMinute` still holds. The open island keys on the hero, the visible rows and "+N more". The habit island keys on the nudge only.
2. **Focus end rings through its own alarm, not the planner's alert path.** `CompanionAlerts` reads only the planner store (`CompanionAlerts.java:45,78,84`), so it cannot see a local focus. An `Offer` gets one optional `alarmAt`. After every local write and after boot, the controller keeps one exact alarm per module in step with it. When the alarm fires, a plain notification says "Focus done".
3. **`NextUp` stays on tasks and events.** Keep `Task.fixed` (the event flag). `NextUp` reads the hero from the Tasks and Calendar modules only, through one helper, so a running focus never takes over the widget. `NextUpTest` must pass unchanged.

## Ranking and rows

4. **Nudge order is tested against `fixtures/habit-cases.json` on the arbiter itself.** Water comes first, then the due meal, then a routine. A pill swipe up runs the first nudge's Later. When no water or meal is due, the due routine's Later runs, as today (`NotchController.java:278-286`). The parity test compares the swipe target too.
5. **The row cut keeps today's rule.** A module may mark a row `keep`. Water marks its row `keep` whether or not it is due, as `NotchScene.visibleRows` does today. The rule is to drop the last row that is not `keep`, and stop when only `keep` rows are left. When n = 0, show no rows.
6. **`Act.Local` carries one `String arg`.** A meal Later names its slot and a routine snooze names its routine id. So a tap acts on what was drawn, even when the meal slot or the due routine changes before the tap lands.

## Reliability

7. **A module that throws keeps its last good offer** until the day changes, and the error is logged. `perform` runs inside `NotchController.safely`. A failed act shows the "Not saved" receipt.
11. **Focus timer clamps.** Time left stays between 0 and the length, and the ring between 0 and 1000, so a clock change cannot draw nonsense. A local receipt is made already saved, with a local token, so Undo shows. Accepted: local Undo lives in memory, so a service restart within its 5 seconds loses it. The minutes between an End and its Undo count as focus time.

## Smaller changes

9. **No package move.** Modules stay in `com.rpm.prototype` as `<Name>Module.java`. `scripts/rules/notch-modules.test.mjs` does two things. It fails when a `*Module.java` file imports or names a view class (`NotchParts`, `NotchContent`, `NotchController`, `IslandView`, `android.view`). It also fails when a module is missing from `NotchModules.ALL`.
10. **No `wakeAt`.** `ACTION_TIME_TICK` already redraws every minute while the screen is on (`NotchController.java:109`).
8. **The playground keeps its current copy during the migration.** Scene JSON exported by JUnit for the playground is a `BACKLOG.md` item. No JS copy is made per module.
12. **Ties.** A task and an event with the same start: Tasks wins because it comes first in the registry. Accepted. `Inputs.Shared`, `Row.filler`, `Hero.builder` and `Offer.none().row` get defined in step 3.

## Revised migration

1. Contract types, `NotchArbiter`, `NotchModules`, and the Tasks, Calendar, Water, Meals and Routines modules. Nothing is wired yet. A parity test checks old `NotchScene` against the arbiter: hero, drops, rows for n = 0..3, "+N more", and the swipe-Later target. `habit-cases.json` runs on the arbiter. `notch-modules.test.mjs` is added.
2. Switch the views to the arbiter, with one key per mode.
3. Switch actions to `perform(Act)`. Delete `NotchContent.Actions`. Move snoozes into module local state.
4. Receipts from `ReceiptSpec`. Delete `NotchScene` and port its tests.
5. `FocusModule` with `alarmAt`, and the calendar countdown chip. Then a phone drive.

## Toolchain probe (done 2026-10-28)

Records and sealed interfaces work. AGP 8.13.2, Java 17 and minSdk 26 build them, the JUnit test passes, and `dexdump` finds both in the APK.

## Deliberate changes

Where the arbiter draws a different island from `NotchScene`, measured by `NotchScenesParityTest`:

- A task and an event at the same start: the task is the hero and the event stays a row (the old notch picked the event). Reason: item 12, registry order breaks ties.

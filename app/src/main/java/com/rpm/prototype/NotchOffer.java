package com.rpm.prototype;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The notch module contract: what a module reads ({@link Inputs}), what it offers ({@link Offer}), the parts an offer is
 * built from, and the {@link Scene} the arbiter arranges. The island turns these into views; modules never touch views.
 */
final class NotchOffer {
    private NotchOffer() {}

    /** Everything a module may read: the clock, the store and its own local state. */
    record Inputs(long now, ZoneId zone, boolean h24, List<NotchDay.Task> tasks, List<NotchWater.Busy> busy, NotchBody body,
                  LocalState local) {
        static Inputs of(NotchData data, long now, ZoneId zone, boolean h24) {
            return new Inputs(now, zone, h24, data.tasks, data.busy, data.body, LocalState.EMPTY);
        }

        Inputs with(LocalState state) {
            return new Inputs(now, zone, h24, tasks, busy, body, state);
        }

        List<NotchDay.Slot> today() {
            return NotchDay.today(tasks, now, zone);
        }

        String clock(long at) {
            return NotchDay.clock(at, zone, h24);
        }

        String shortClock(long at) {
            return NotchDay.shortClock(at, now, zone, h24);
        }

        String minutes(long ms) {
            return NotchDay.minutes(ms);
        }

        String spoken(long ms) {
            return NotchDay.spoken(ms);
        }

        long snoozeMs() {
            return body.water.snoozeMinutes * NotchDay.MIN;
        }
    }

    /** What one module keeps on the phone only, as strings by key. */
    record LocalState(Map<String, String> values) {
        static final LocalState EMPTY = new LocalState(Map.of());

        LocalState {
            values = Map.copyOf(values);
        }

        long getLong(String key, long fallback) {
            String v = values.get(key);
            if (v == null) return fallback;
            try {
                return Long.parseLong(v);
            } catch (NumberFormatException e) {
                return fallback;
            }
        }

        LocalState with(String key, String value) {
            Map<String, String> out = new HashMap<>(values);
            out.put(key, value);
            return new LocalState(out);
        }

        LocalState without(Iterable<String> keys) {
            Map<String, String> out = new HashMap<>(values);
            for (String k : keys) out.remove(k);
            return new LocalState(out);
        }
    }

    /** What one module asks to show now. Any part may be absent. */
    record Offer(Hero hero, Nudge nudge, List<Row> rows) {
        static final Offer NONE = new Offer(null, null, List.of());
    }

    /** A module's bid for the task island: one thing running now or next. */
    record Hero(Urgency urgency, long at, Look look, String title, String line, int ringPermille, String value, String spoken,
                String barSpoken, Control primary, Act open, Art drop, List<Row> attached, Row asRow) {
        enum Urgency { RUNNING, UPCOMING }
    }

    /** A module's bid for the habit island. {@code meter} null means no pill drop; {@code hold} may be null. */
    record Nudge(Meter meter, String line, String spoken, Control primary, Control later, Act hold) {}

    /**
     * One line under the island's hero. {@code keep} rows stay when rows drop to fit; {@code due} rows move up to second;
     * {@code tap} and {@code circle} may be null.
     */
    record Row(Place place, long at, boolean alerting, boolean due, boolean keep, Look look, String title, String spoken,
               Act tap, List<Trail> trail, Circle circle) {
        /** ATTACHED rows follow the hero; TIMED rows sort by {@code at}; NUDGE rows sit after the first timed row. */
        enum Place { ATTACHED, TIMED, NUDGE }

        Row withLook(Look next) {
            return new Row(place, at, alerting, due, keep, next, title, spoken, tap, trail, circle);
        }
    }

    record Look(int icon, int accent) {
        static final Look TASK = new Look(R.drawable.notch_ic_task, NotchInk.TASK);
        static final Look EVENT = new Look(R.drawable.notch_ic_event, NotchInk.EVENT);
        static final Look WATER = new Look(R.drawable.notch_ic_water, NotchInk.WATER);
        static final Look HABIT = new Look(R.drawable.notch_ic_routine, NotchInk.HABIT);
        static final Look MEAL = new Look(R.drawable.notch_ic_meal, NotchInk.MEAL);
        static final Look REMINDER = new Look(R.drawable.ic_notification, NotchInk.WHITE_87);
        static final Look ALARM = new Look(R.drawable.ic_clock, NotchInk.ALARM);

        static Look alert(String alert) {
            return "alarm".equals(alert) ? ALARM : REMINDER;
        }

        /** "Reminder" or "Ringing alarm", as the planner's alert picker names them. */
        static String alertName(String alert) {
            return "alarm".equals(alert) ? "Ringing alarm" : "Reminder";
        }
    }

    record Control(int icon, String label, String spoken, Act act) {}

    /** The round button at a row's end. */
    record Circle(int icon, int tint, String spoken, Act act) {}

    sealed interface Trail {
        record Value(String text, int color) implements Trail {}
        record Dots(int count, int goal) implements Trail {}
        record AlertChip(String alert, String at) implements Trail {}
    }

    sealed interface Meter {
        record Water(int goal, int count) implements Meter {}
        record Meals(List<String> slots, List<Integer> logged) implements Meter {}
        record Ring(int permille, int accent) implements Meter {}
    }

    /** What a pill drop draws. */
    sealed interface Art {
        int NEUTRAL = -1;
        record Capsule(int tone, int icon) implements Art {}
        record Gauge(Meter meter) implements Art {}
    }

    record ReceiptSpec(Look look, String title, String detail, float from, float to, Meter meter) {}

    /** What a tap does, as data: the controller runs it. */
    sealed interface Act {
        record Save(PlannerRequest request, ReceiptSpec receipt) implements Act {}
        /** A change only the notch keeps (a snooze); the owning module's {@code apply} runs it. */
        record Local(String module, String verb, String arg, ReceiptSpec receipt, String note) implements Act {}
        record Open(PlannerTarget target) implements Act {}
        record ManageAlert(long taskId, long start, String alert, String title, String at) implements Act {}
    }

    /** A change the planner saves for the notch, with its Undo. */
    sealed interface PlannerRequest {
        record Drink() implements PlannerRequest {}
        record Done(long id, long start, boolean repeats, boolean near) implements PlannerRequest {}
        record SetAlert(long id, String type) implements PlannerRequest {}
        record Undo(String token) implements PlannerRequest {}
    }

    /** Where the planner opens: a view, with a meal slot or a task id when it needs one. */
    record PlannerTarget(String view, String slot, long id) {
        static PlannerTarget day() {
            return new PlannerTarget("day", null, 0);
        }

        static PlannerTarget task(long id) {
            return new PlannerTarget("day", null, id);
        }

        static PlannerTarget water() {
            return new PlannerTarget("water", null, 0);
        }

        static PlannerTarget meal(String slot) {
            return new PlannerTarget("meal", slot, 0);
        }
    }

    /** A value tagged with the module that offered it. */
    record Owned<T>(String module, T value) {}

    /** What the island shows at one moment, arranged from every module's offer. {@code cut} counts rows past the three. */
    record Scene(Owned<Hero> hero, Owned<Nudge> nudge, List<Row> rows, int cut, List<String> failed) {
        List<Row> attached() {
            return hero == null ? List.of() : hero.value().attached();
        }

        /** The first {@code n} rows. When rows must drop to fit, {@code keep} rows stay, so the island can always log a glass. */
        List<Row> visible(int n) {
            List<Row> out = new ArrayList<>(attached());
            out.addAll(rows);
            for (int i = out.size() - 1; out.size() > Math.max(0, n) && i >= 0; i--) {
                if (!out.get(i).keep() || n == 0) out.remove(i);
            }
            return out;
        }

        /** What the island leaves out when it shows {@code n} rows; it says "+N more" for them. */
        int more(int n) {
            return rows.size() + cut + attached().size() - visible(n).size();
        }

        Art taskDrop() {
            return hero == null ? null : hero.value().drop();
        }

        Art habitDrop() {
            return nudge == null || nudge.value().meter() == null ? null : new Art.Gauge(nudge.value().meter());
        }

        /** What a swipe on the pill does: the nudge's Later, or null when nothing is due. */
        Act later() {
            return nudge == null || nudge.value().later() == null ? null : nudge.value().later().act();
        }
    }
}

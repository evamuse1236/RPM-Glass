package com.rpm.prototype;

import java.util.List;

/** The small shapes a module's offer is built from. The island turns them into views; modules never touch views. */
final class Parts {
    private Parts() {}

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
}

package com.rpm.prototype;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

final class NotchHabits {
    private static final List<String> MEAL_ORDER = java.util.Arrays.asList("breakfast", "lunch", "snack", "dinner");
    private NotchHabits() {}

    /** Where one routine stands today. */
    static final class RoutineStatus {
        final NotchBody.Routine routine;
        final int total;
        final int done;
        final int open;
        final long start;
        final long end;
        /** upcoming, running, done, partly or missed (routineState); empty and skipped routines are left out. */
        final String state;
        /** The first step not yet ticked or skipped, or null. */
        final String nextStep;

        RoutineStatus(NotchBody.Routine routine, int total, int done, int open, long start, long end, String state, String nextStep) {
            this.routine = routine;
            this.total = total;
            this.done = done;
            this.open = open;
            this.start = start;
            this.end = end;
            this.state = state;
            this.nextStep = nextStep;
        }

        /** Inside its window with steps still open: the notch nudges. */
        boolean dueAt(long now) {
            return "running".equals(state) && open > 0 && start <= now;
        }
    }

    /** Routines that run today, in window order. */
    static List<RoutineStatus> routines(NotchBody body, long now, ZoneId zone) {
        LocalDate day = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        int weekday = day.getDayOfWeek().getValue() % 7;
        List<RoutineStatus> out = new ArrayList<>();
        for (NotchBody.Routine r : body.routines) {
            if (!r.days.contains(weekday) || r.steps.isEmpty()) continue;
            NotchBody.Run run = body.run(r.id, day.toString());
            if (run != null && run.skippedDay) continue;
            int done = 0, skipped = 0;
            String next = null;
            for (NotchBody.Step step : r.steps) {
                String mark = run == null ? null : run.marks.get(step.id);
                if ("done".equals(mark)) done++;
                else if ("skipped".equals(mark)) skipped++;
                else if (next == null) next = step.title;
            }
            int open = r.steps.size() - done - skipped;
            long start = at(day, r.start, zone), end = at(day, r.end, zone);
            boolean touched = done + skipped > 0;
            String state;
            if (open == 0) state = skipped > 0 ? "partly" : "done";
            else if (now >= end) state = touched ? "partly" : "missed";
            else if (now < start && !touched) state = "upcoming";
            else state = "running";
            out.add(new RoutineStatus(r, r.steps.size(), done, open, start, end, state, next));
        }
        out.sort((a, b) -> Long.compare(a.start, b.start));
        return out;
    }

    /** guessSlot: breakfast 4:00–10:59, lunch 11:00–15:29, snack 15:30–18:59, else dinner. */
    static String slot(long at, ZoneId zone) {
        ZonedDateTime t = Instant.ofEpochMilli(at).atZone(zone);
        int m = t.getHour() * 60 + t.getMinute();
        if (m >= 240 && m < 660) return "breakfast";
        if (m >= 660 && m < 930) return "lunch";
        if (m >= 930 && m < 1140) return "snack";
        return "dinner";
    }

    static String unloggedMeal(NotchBody body, long now, ZoneId zone) {
        LocalDate day = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        String selected = null;
        long earliest = Long.MAX_VALUE;
        for (NotchBody.MealSlot slot : body.mealPlan) {
            long start = at(day, slot.at, zone);
            if (!slot.on || now < start || now >= start + 120 * NotchDay.MIN) continue;
            boolean logged = false;
            for (NotchBody.Meal m : body.meals) {
                if (slot.slot.equals(m.slot) && Instant.ofEpochMilli(m.at).atZone(zone).toLocalDate().equals(day)) {
                    logged = true;
                    break;
                }
            }
            if (!logged && (start < earliest || (start == earliest && MEAL_ORDER.indexOf(slot.slot) < MEAL_ORDER.indexOf(selected)))) {
                selected = slot.slot;
                earliest = start;
            }
        }
        return selected;
    }

    enum Habit { WATER, MEAL }

    static Habit top(boolean waterDue, String dueMeal) {
        if (waterDue) return Habit.WATER;
        return dueMeal == null ? null : Habit.MEAL;
    }

    static final class MealMeter {
        final List<String> slots;
        final List<Integer> logged;

        MealMeter(List<String> slots, List<Integer> logged) {
            this.slots = slots;
            this.logged = logged;
        }

        String key() {
            return slots + "" + logged;
        }
    }

    static MealMeter mealMeter(NotchBody body, long now, ZoneId zone) {
        LocalDate day = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        List<String> slots = new ArrayList<>();
        for (NotchBody.MealSlot s : body.mealPlan) if (s.on) slots.add(s.slot);
        List<Integer> logged = new ArrayList<>();
        for (int i = 0; i < slots.size(); i++) {
            for (NotchBody.Meal m : body.meals) {
                if (!m.skipped && slots.get(i).equals(m.slot) && Instant.ofEpochMilli(m.at).atZone(zone).toLocalDate().equals(day)) {
                    logged.add(i);
                    break;
                }
            }
        }
        return new MealMeter(slots, logged);
    }

    static String mealName(NotchBody body, String slot) {
        for (NotchBody.MealSlot planned : body.mealPlan) if (planned.slot.equals(slot)) return planned.name;
        return slotName(slot);
    }

    static String slotName(String slot) {
        return slot.isEmpty() ? slot : Character.toUpperCase(slot.charAt(0)) + slot.substring(1);
    }

    private static long at(LocalDate day, int minutes, ZoneId zone) {
        return day.atTime(LocalTime.of(minutes / 60, minutes % 60)).atZone(zone).toInstant().toEpochMilli();
    }
}

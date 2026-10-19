package com.rpm.prototype;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** Everything the island draws at one moment, worked out from the planner store, the calendar and the clock. */
final class NotchScene {
    /** Which icon and accent a shape or row uses. */
    enum Look { TASK, EVENT, WATER, HABIT, MEAL, REMINDER, ALARM }

    static final String WATER_SNOOZE = "water";

    static String routineSnooze(String routineId) {
        return "routine:" + routineId;
    }

    static final class Row {
        final Look look;
        final String title;
        final String value;
        /** The task occurrence a task, event or alert row shows; null for water, routines and meals. */
        final NotchDay.Slot slot;
        /** "alarm" or "reminder" when the row's task still has that alert to give, else "". Such a row opens its controls. */
        final String alert;

        Row(Look look, String title, String value) {
            this(look, title, value, null, "");
        }

        Row(Look look, String title, String value, NotchDay.Slot slot, String alert) {
            this.look = look;
            this.title = title;
            this.value = value;
            this.slot = slot;
            this.alert = alert;
        }
    }

    static Look alertLook(String alert) {
        return "alarm".equals(alert) ? Look.ALARM : Look.REMINDER;
    }

    /** "Reminder" or "Ringing alarm", as the planner's alert picker names them. */
    static String alertName(String alert) {
        return "alarm".equals(alert) ? "Ringing alarm" : "Reminder";
    }

    /** The current task or calendar event, or null when nothing timed is left today. */
    final NotchDay.Slot hero;
    final boolean running;
    /** The hero's alert still to come ("alarm", "reminder"), shown as a chip that opens its controls; else "". */
    final String heroAlert;
    /** The first task occurrence today whose alert is still to come, or null. */
    final NotchDay.Slot nextAlert;
    final String heroAt;
    /** The collapsed pill's value for the current item: "25m" left, or the start time. */
    final String pillValue;
    final String spoken;
    /** The expanded panel's hero row: the current item, else the due water or routine. */
    final Look heroLook;
    final String heroTitle;
    final String heroSubtitle;
    final String barStart;
    final String barEnd;
    final float progress;
    final String barSpoken;
    final List<Row> rows = new ArrayList<>();
    /** Null when the planner has no Body data yet. */
    final NotchWater.Status water;
    /** The first routine with steps due now and not snoozed here, or null. */
    final NotchHabits.RoutineStatus habit;
    /** The meal slot not logged yet ("lunch"), or null. */
    final String meal;
    final int snoozeMinutes;
    final boolean canLogMeal;

    NotchScene(NotchData data, long now, Map<String, Long> snoozes, ZoneId zone, boolean h24) {
        List<NotchDay.Slot> slots = NotchDay.today(data.tasks, now, zone);
        hero = NotchDay.hero(slots, now);
        running = hero != null && hero.runningAt(now);
        heroAlert = hero == null || hero.task.fixed ? "" : hero.alertAt(now);
        heroAt = hero == null ? "" : NotchDay.clock(hero.start, zone, h24);
        NotchDay.Slot alerting = null;
        for (NotchDay.Slot slot : slots) if (alerting == null && !slot.task.fixed && !slot.alertAt(now).isEmpty()) alerting = slot;
        nextAlert = alerting;
        NotchBody body = data.body;
        canLogMeal = body.present;
        snoozeMinutes = body.water.snoozeMinutes;
        long waterSnooze = Math.max(body.waterSnoozedUntil, snooze(snoozes, WATER_SNOOZE));
        NotchWater.Status waterStatus = body.present ? NotchWater.status(body.glasses, body.water, data.busy, waterSnooze, now, zone) : null;
        water = waterStatus != null && !body.water.reminders
                ? new NotchWater.Status(waterStatus.count, waterStatus.goal, 0, false) : waterStatus;
        List<NotchHabits.RoutineStatus> routines = body.present ? NotchHabits.routines(body, now, zone) : Collections.emptyList();
        NotchHabits.RoutineStatus due = null;
        for (NotchHabits.RoutineStatus r : routines) {
            if (due == null && r.dueAt(now) && snooze(snoozes, routineSnooze(r.routine.id)) <= now) due = r;
        }
        habit = due;
        meal = body.present ? NotchHabits.unloggedMeal(body, now, zone) : null;

        if (hero != null) {
            heroLook = hero.task.fixed ? Look.EVENT : Look.TASK;
            heroTitle = hero.task.title;
            String block = hero.task.block == null || hero.task.block.isEmpty() ? "" : hero.task.block + " · ";
            if (running) {
                pillValue = NotchDay.minutes(hero.end - now);
                heroSubtitle = block + NotchDay.spoken(hero.end - now) + " left";
                barStart = NotchDay.minutes(Math.max(NotchDay.MIN, now - hero.start));
                barEnd = "-" + pillValue;
                progress = (now - hero.start) / (float) (hero.end - hero.start);
                spoken = hero.task.title + ", " + NotchDay.spoken(hero.end - now) + " left";
                barSpoken = barStart + " done, " + pillValue + " left";
            } else {
                String at = NotchDay.clock(hero.start, zone, h24);
                pillValue = at;
                heroSubtitle = block + at + ", in " + NotchDay.spoken(hero.start - now);
                barStart = at;
                barEnd = NotchDay.minutes(hero.end - hero.start);
                progress = 0;
                spoken = "Next: " + hero.task.title + " at " + at;
                barSpoken = "Starts at " + at + ", lasts " + NotchDay.spoken(hero.end - hero.start);
            }
        } else {
            pillValue = spoken = null;
            if (waterDue() || habit == null) {
                heroLook = Look.WATER;
                heroTitle = "Water";
                heroSubtitle = water == null ? "" : water.count + " of " + water.goal + " glasses today" + (waterDue() ? " · due now" : "");
                barStart = water == null ? "" : String.valueOf(water.count);
                barEnd = water == null ? "" : String.valueOf(water.goal);
                progress = water == null ? 0 : Math.min(1f, water.count / (float) water.goal);
                barSpoken = water == null ? "" : water.count + " of " + water.goal + " glasses";
            } else {
                heroLook = Look.HABIT;
                heroTitle = habit.routine.name;
                heroSubtitle = habit.nextStep == null ? habitValue(habit) + " done" : "Next: " + habit.nextStep;
                barStart = String.valueOf(habit.done);
                barEnd = String.valueOf(habit.total);
                progress = habit.done / (float) habit.total;
                barSpoken = habit.done + " of " + habit.total + " steps done";
            }
        }

        List<NotchDay.Slot> later = NotchDay.after(slots, hero, 3);
        if (!later.isEmpty()) rows.add(slotRow(later.get(0), now, zone, h24));
        if (habit != null && heroLook != Look.HABIT) rows.add(new Row(Look.HABIT, habit.routine.name, habit.done + " of " + habit.total));
        if (water != null && heroLook != Look.WATER) rows.add(new Row(Look.WATER, "Water", water.count + " of " + water.goal + (water.pending ? " · due" : "")));
        if (meal != null) rows.add(new Row(Look.MEAL, NotchHabits.mealName(body, meal), "Not logged"));
        for (int i = 1; i < later.size() && rows.size() < 3; i++) rows.add(slotRow(later.get(i), now, zone, h24));
        if (nextAlert != null && nextAlert != hero && (later.isEmpty() || later.get(0) != nextAlert)) {
            rows.add(0, new Row(alertLook(nextAlert.task.alert), nextAlert.task.title, NotchDay.clock(nextAlert.start, zone, h24), nextAlert, nextAlert.task.alert));
        }
        for (int i = 2; i < rows.size(); i++) {
            if (rows.get(i).look == Look.WATER && waterDue()) rows.add(1, rows.remove(i));
        }
        while (rows.size() > 3) rows.remove(rows.size() - 1);
    }

    private static Row slotRow(NotchDay.Slot s, long now, ZoneId zone, boolean h24) {
        return new Row(s.task.fixed ? Look.EVENT : Look.TASK, s.task.title, NotchDay.clock(s.start, zone, h24), s, s.task.fixed ? "" : s.alertAt(now));
    }

    private static long snooze(Map<String, Long> snoozes, String key) {
        Long until = snoozes.get(key);
        return until == null ? 0 : until;
    }

    static String habitValue(NotchHabits.RoutineStatus r) {
        return r.done + "/" + r.total;
    }

    String waterValue() {
        return water.count + "/" + water.goal;
    }

    boolean waterDue() {
        return water != null && water.pending;
    }

    /** Done ticks a task; a calendar event is fixed. */
    boolean canDone() {
        return hero != null && !hero.task.fixed;
    }

    /** With no task to tick, water is the hero and its first control logs a glass. */
    boolean canDrink() {
        return water != null && heroLook == Look.WATER;
    }

    boolean canSnooze() {
        return waterDue() || habit != null;
    }

    /** Changes whenever anything the panel draws changes. */
    String key() {
        StringBuilder k = new StringBuilder(hero == null ? "-" : hero.task.id + "@" + hero.start);
        k.append('|').append(heroLook).append(heroTitle).append('|').append(heroSubtitle).append('|').append(barStart).append('|')
                .append(barEnd).append('|').append(Math.round(progress * 1000)).append(canDone()).append(canDrink()).append(canSnooze()).append(canLogMeal)
                .append(meal != null).append('|').append(heroAlert);
        for (int i = 0; i < Math.min(2, rows.size()); i++) {
            Row r = rows.get(i);
            k.append('|').append(r.look).append(r.title).append(r.value).append(r.alert);
        }
        return k.toString();
    }
}

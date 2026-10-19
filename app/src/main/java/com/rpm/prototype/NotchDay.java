package com.rpm.prototype;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Today's timed plan as the notch shows it. Mirrors the planner's rules: occurrences as in planner-recurrence.mjs,
 * and the task in hand as doNext in day-parts.mjs (the first undone timed task that has not ended).
 */
final class NotchDay {
    static final long MIN = 60_000L;
    private static final DateTimeFormatter OCCURRENCE = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).withZone(ZoneId.of("UTC"));

    /** The fields of one open planner task (or calendar event) that the notch needs. */
    static final class Task {
        final long id;
        final String title;
        final String block;
        final Instant planned;
        final int minutes;
        final String recurrence;
        final Set<String> completedOccurrences;
        /** A calendar event: fixed, not the person's to tick off. */
        final boolean fixed;
        /** "alarm", "reminder", or "" for no alert (NotchData.alertType). */
        final String alert;

        Task(long id, String title, String block, Instant planned, int minutes, String recurrence, Set<String> completedOccurrences) {
            this(id, title, block, planned, minutes, recurrence, completedOccurrences, false, "");
        }

        Task(long id, String title, String block, Instant planned, int minutes, String recurrence, Set<String> completedOccurrences, boolean fixed,
             String alert) {
            this.id = id;
            this.title = title;
            this.block = block;
            this.planned = planned;
            this.minutes = minutes;
            this.recurrence = recurrence;
            this.completedOccurrences = completedOccurrences;
            this.fixed = fixed;
            this.alert = alert;
        }
    }

    /** One occurrence of a task on today's clock. */
    static final class Slot {
        final Task task;
        final long start;
        final long end;

        Slot(Task task, long start) {
            this.task = task;
            this.start = start;
            this.end = start + task.minutes * MIN;
        }

        boolean runningAt(long now) {
            return start <= now && now < end;
        }

        /** The alert this occurrence still has to give: its type when it asked for one and has not started yet, else "". */
        String alertAt(long now) {
            return start > now ? task.alert : "";
        }
    }

    private NotchDay() {}

    /** Every occurrence that overlaps today, earliest first. */
    static List<Slot> today(List<Task> tasks, long now, ZoneId zone) {
        LocalDate day = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        long from = day.atStartOfDay(zone).toInstant().toEpochMilli();
        long to = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
        List<Slot> slots = new ArrayList<>();
        for (Task task : tasks) {
            for (ZonedDateTime at : candidates(task, day, zone)) {
                Slot slot = new Slot(task, at.toInstant().toEpochMilli());
                boolean overlaps = slot.start < to && slot.end > from;
                if (overlaps && !task.completedOccurrences.contains(OCCURRENCE.format(at.toInstant()))) slots.add(slot);
            }
        }
        Collections.sort(slots, (a, b) -> a.start != b.start ? Long.compare(a.start, b.start) : Long.compare(a.task.id, b.task.id));
        return slots;
    }

    /** One-time tasks have their own time; daily, weekly and weekday repeats keep the first time's local clock. */
    private static List<ZonedDateTime> candidates(Task task, LocalDate day, ZoneId zone) {
        List<ZonedDateTime> out = new ArrayList<>();
        ZonedDateTime base = task.planned.atZone(zone);
        String r = task.recurrence;
        if (!"daily".equals(r) && !"weekly".equals(r) && !"weekdays".equals(r)) {
            out.add(base);
            return out;
        }
        for (LocalDate d = day.minusDays(1); !d.isAfter(day); d = d.plusDays(1)) {
            long days = d.toEpochDay() - base.toLocalDate().toEpochDay();
            if (days < 0 || ("weekly".equals(r) && days % 7 != 0)) continue;
            DayOfWeek dow = d.getDayOfWeek();
            if ("weekdays".equals(r) && (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY)) continue;
            out.add(base.plusDays(days));
        }
        return out;
    }

    /** What is happening now: a running task before a running calendar event, else the next one to start. */
    static Slot hero(List<Slot> slots, long now) {
        for (Slot s : slots) if (s.runningAt(now) && !s.task.fixed) return s;
        for (Slot s : slots) if (s.end > now) return s;
        return null;
    }

    /** Up to {@code n} slots that start after the hero, in order; none when there is no hero (nothing left today). */
    static List<Slot> after(List<Slot> slots, Slot hero, int n) {
        List<Slot> out = new ArrayList<>();
        if (hero == null) return out;
        boolean past = false;
        for (Slot s : slots) {
            if (s == hero) past = true;
            else if (past && s.start >= hero.start && out.size() < n) out.add(s);
        }
        return out;
    }

    /** "25m", "1h 5m": whole minutes, at least one. */
    static String minutes(long ms) {
        long m = Math.max(1, ms / MIN);
        if (m < 60) return m + "m";
        return (m / 60) + "h" + (m % 60 == 0 ? "" : " " + (m % 60) + "m");
    }

    /** "25 min", "1 h 5 min", for sentences. */
    static String spoken(long ms) {
        long m = Math.max(1, ms / MIN);
        if (m < 60) return m + " min";
        return (m / 60) + " h" + (m % 60 == 0 ? "" : " " + (m % 60) + " min");
    }

    static String clock(long at, ZoneId zone, boolean h24) {
        return DateTimeFormatter.ofPattern(h24 ? "H:mm" : "h:mm a", Locale.US).format(Instant.ofEpochMilli(at).atZone(zone));
    }
}

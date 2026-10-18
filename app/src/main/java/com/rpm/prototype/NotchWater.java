package com.rpm.prototype;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/** Today's water for the notch, by the same rules as waterStatus in body-state.mjs. */
final class NotchWater {
    /** The Body store's water settings; defaults match WATER_SETTINGS in body-store.mjs. */
    static final class Settings {
        int goal = 8;
        int intervalMinutes = 90;
        String from = "08:00";
        String until = "22:00";
        int snoozeMinutes = 15;
        /** Off means the person turned water nudges off; the count still shows. */
        boolean reminders = true;
    }

    /** A calendar block that holds nudges until it ends. */
    static final class Busy {
        final long start;
        final long end;

        Busy(long start, long end) {
            this.start = start;
            this.end = end;
        }
    }

    static final class Status {
        final int count;
        final int goal;
        /** When the next nudge is due, or 0 when none is due today. */
        final long nextAt;
        final boolean pending;

        Status(int count, int goal, long nextAt, boolean pending) {
            this.count = count;
            this.goal = goal;
            this.nextAt = nextAt;
            this.pending = pending;
        }
    }

    private NotchWater() {}

    /**
     * Nudges start at {@code from}, follow the last glass by the interval (or a snooze), wait out a busy block and stop
     * at {@code until} or once the goal is met. {@code snoozedUntil} is 0 when not snoozed.
     */
    static Status status(List<Long> glasses, Settings s, List<Busy> busy, long snoozedUntil, long now, ZoneId zone) {
        LocalDate day = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        List<Long> today = new ArrayList<>();
        for (long g : glasses) if (Instant.ofEpochMilli(g).atZone(zone).toLocalDate().equals(day)) today.add(g);
        long last = 0;
        for (long g : today) last = Math.max(last, g);
        long start = at(day, s.from, zone);
        long end = at(day, s.until, zone);
        boolean paused = false;
        for (Busy b : busy) paused |= b.start <= now && now < b.end;
        if (today.size() >= s.goal || !s.reminders) return new Status(today.size(), s.goal, 0, false);
        long next = last != 0 ? last + s.intervalMinutes * NotchDay.MIN : start;
        if (next < start) next = start;
        if (snoozedUntil > next) next = snoozedUntil;
        for (boolean moved = true; moved; ) {
            moved = false;
            for (Busy b : busy) {
                if (b.start <= next && next < b.end) {
                    next = b.end;
                    moved = true;
                }
            }
        }
        if (next >= end) next = 0;
        return new Status(today.size(), s.goal, next, next != 0 && next <= now && !paused);
    }

    private static long at(LocalDate day, String clock, ZoneId zone) {
        return day.atTime(LocalTime.parse(clock)).atZone(zone).toInstant().toEpochMilli();
    }
}

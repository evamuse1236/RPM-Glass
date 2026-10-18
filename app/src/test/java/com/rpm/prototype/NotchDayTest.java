package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;

import org.junit.Test;

public class NotchDayTest {
    private static final ZoneId KOLKATA = ZoneId.of("Asia/Kolkata");

    private static long at(String local) {
        return LocalDateTime.parse(local).atZone(KOLKATA).toInstant().toEpochMilli();
    }

    private static NotchDay.Task task(long id, String title, String planned, int minutes, String recurrence, String... completed) {
        return new NotchDay.Task(id, title, null, Instant.ofEpochMilli(at(planned)), minutes, recurrence, new HashSet<>(Arrays.asList(completed)));
    }

    @Test
    public void theRunningTaskIsTheHeroWithItsTimeLeft() {
        List<NotchDay.Task> tasks = Arrays.asList(
                task(1, "Write RM essay", "2026-10-18T15:30", 45, ""),
                task(2, "Call Prof. Rao", "2026-10-18T16:30", 30, ""),
                task(3, "Gym", "2026-10-18T19:00", 60, ""));
        long now = at("2026-10-18T15:50");
        List<NotchDay.Slot> slots = NotchDay.today(tasks, now, KOLKATA);
        NotchDay.Slot hero = NotchDay.hero(slots, now);
        assertEquals(1, hero.task.id);
        assertTrue(hero.runningAt(now));
        assertEquals("25m", NotchDay.minutes(hero.end - now));
        List<NotchDay.Slot> rest = NotchDay.after(slots, hero, 3);
        assertEquals(2, rest.size());
        assertEquals(2, rest.get(0).task.id);
    }

    @Test
    public void betweenTasksTheNextOneLeads() {
        List<NotchDay.Task> tasks = Collections.singletonList(task(2, "Call Prof. Rao", "2026-10-18T16:30", 30, ""));
        long now = at("2026-10-18T16:00");
        NotchDay.Slot hero = NotchDay.hero(NotchDay.today(tasks, now, KOLKATA), now);
        assertFalse(hero.runningAt(now));
        assertEquals("4:30 PM", NotchDay.clock(hero.start, KOLKATA, false));
        assertEquals("16:30", NotchDay.clock(hero.start, KOLKATA, true));
    }

    @Test
    public void nothingLeftTodayMeansNoHero() {
        List<NotchDay.Task> tasks = Arrays.asList(
                task(1, "Morning run", "2026-10-18T07:00", 30, ""),
                task(2, "Tomorrow's call", "2026-10-19T10:00", 30, ""));
        long now = at("2026-10-18T12:00");
        List<NotchDay.Slot> slots = NotchDay.today(tasks, now, KOLKATA);
        assertEquals(1, slots.size());
        assertNull(NotchDay.hero(slots, now));
    }

    @Test
    public void dailyRepeatsKeepTheirClockAndSkipCompletedOccurrences() {
        NotchDay.Task stretch = task(5, "Stretch", "2026-10-01T18:00", 15, "daily");
        long now = at("2026-10-18T09:00");
        List<NotchDay.Slot> slots = NotchDay.today(Collections.singletonList(stretch), now, KOLKATA);
        assertEquals(1, slots.size());
        assertEquals(at("2026-10-18T18:00"), slots.get(0).start);
        NotchDay.Task done = task(5, "Stretch", "2026-10-01T18:00", 15, "daily", "2026-10-18T12:30:00.000Z");
        assertTrue(NotchDay.today(Collections.singletonList(done), now, KOLKATA).isEmpty());
    }

    @Test
    public void weeklyAndWeekdayRepeatsOnlyLandOnTheirDays() {
        long sunday = at("2026-10-18T09:00");
        NotchDay.Task weekly = task(6, "Review", "2026-10-11T10:00", 30, "weekly");
        NotchDay.Task weekdays = task(7, "Standup", "2026-10-12T09:30", 15, "weekdays");
        NotchDay.Task otherWeekly = task(8, "Piano", "2026-10-13T17:00", 30, "weekly");
        List<NotchDay.Slot> slots = NotchDay.today(Arrays.asList(weekly, weekdays, otherWeekly), sunday, KOLKATA);
        assertEquals(1, slots.size());
        assertEquals(6, slots.get(0).task.id);
    }

    @Test
    public void durationsReadPlainly() {
        assertEquals("1m", NotchDay.minutes(10_000));
        assertEquals("59m", NotchDay.minutes(59 * NotchDay.MIN + 59_000));
        assertEquals("1h", NotchDay.minutes(60 * NotchDay.MIN));
        assertEquals("1h 5m", NotchDay.minutes(65 * NotchDay.MIN));
        assertEquals("1 h 5 min", NotchDay.spoken(65 * NotchDay.MIN));
    }
}

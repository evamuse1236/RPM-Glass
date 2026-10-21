package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class RepeatsTest {
    private static final ZoneId KOLKATA = ZoneId.of("Asia/Kolkata");

    private static long at(String local) {
        return LocalDateTime.parse(local).atZone(KOLKATA).toInstant().toEpochMilli();
    }

    private static JSONObject chosen(int... days) throws Exception {
        JSONArray list = new JSONArray();
        for (int d : days) list.put(d);
        return new JSONObject().put("recurrence", "days").put("repeatDays", list);
    }

    @Test
    public void chosenDaysReadAsOneKeyInWeekOrder() throws Exception {
        assertEquals("days:135", Repeats.key(chosen(5, 1, 3)));
        assertEquals("", Repeats.key(new JSONObject().put("recurrence", "days")));
        assertEquals("weekdays", Repeats.key(new JSONObject().put("recurrence", "weekdays")));
        assertEquals("", Repeats.key(new JSONObject()));
    }

    @Test
    public void aChosenDaysRepeatLandsOnlyOnThoseDays() {
        assertTrue(Repeats.on("days:135", DayOfWeek.MONDAY));
        assertFalse(Repeats.on("days:135", DayOfWeek.TUESDAY));
        assertTrue(Repeats.on("days:0", DayOfWeek.SUNDAY));
        assertFalse(Repeats.on("weekdays", DayOfWeek.SATURDAY));
        assertTrue(Repeats.repeating("days:6"));
        assertFalse(Repeats.repeating(""));
    }

    @Test
    public void theNextAlertOfAChosenDaysRepeatSkipsTheOtherDays() {
        long monday = at("2026-10-19T16:00");
        long next = CompanionAlerts.next(monday, "days:15", KOLKATA, at("2026-10-19T17:00"));
        assertEquals(at("2026-10-23T16:00"), next);
        assertEquals(at("2026-10-21T16:00"), CompanionAlerts.next(at("2026-10-20T16:00"), "days:3", KOLKATA, at("2026-10-19T09:00")));
    }

    @Test
    public void aLeadSoundsTheAlertEarlierButNeverInThePast() {
        long four = at("2026-10-20T16:00");
        assertEquals(at("2026-10-20T15:50"), CompanionAlerts.fireAt(four, 10, at("2026-10-20T09:00")));
        assertEquals(at("2026-10-20T15:55"), CompanionAlerts.fireAt(four, 10, at("2026-10-20T15:55")));
        assertEquals(four, CompanionAlerts.fireAt(four, 0, at("2026-10-20T09:00")));
    }

    @Test
    public void theLeadIsReadFromTheAlertIntent() throws Exception {
        assertEquals(30, Repeats.lead(new JSONObject().put("alertIntent", new JSONObject().put("type", "reminder").put("lead", 30))));
        assertEquals(0, Repeats.lead(new JSONObject().put("alertIntent", new JSONObject().put("type", "alarm"))));
    }

    @Test
    public void theNotchShowsAChosenDaysTaskOnlyOnItsDays() {
        NotchDay.Task gym = new NotchDay.Task(1, "Gym", null, Instant.ofEpochMilli(at("2026-10-19T07:00")), 60, "days:135",
                Collections.emptySet());
        List<NotchDay.Task> tasks = Arrays.asList(gym);
        assertEquals(1, NotchDay.today(tasks, at("2026-10-21T06:00"), KOLKATA).size());
        assertEquals(0, NotchDay.today(tasks, at("2026-10-22T06:00"), KOLKATA).size());
    }
}

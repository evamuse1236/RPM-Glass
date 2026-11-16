package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

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

    @Test
    public void aDailyAlertInTheSkippedHourIsBackAtItsOwnClockTheDayAfterSpringForward() {
        ZoneId ny = ZoneId.of("America/New_York");
        long base = LocalDateTime.parse("2027-03-10T02:30").atZone(ny).toInstant().toEpochMilli();
        long now = LocalDateTime.parse("2027-03-14T09:00").atZone(ny).toInstant().toEpochMilli();
        assertEquals(Instant.parse("2027-03-15T06:30:00Z").toEpochMilli(), CompanionAlerts.next(base, "daily", ny, now));
    }

    private static Path repeatCases() {
        for (Path dir = Paths.get("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path file = dir.resolve("fixtures/repeat-cases.json");
            if (Files.isRegularFile(file)) return file;
        }
        throw new AssertionError("Cannot find fixtures/repeat-cases.json from " + Paths.get("").toAbsolutePath());
    }

    /** The planner runs the same cases in planner-recurrence.test.mjs: one repeat means one set of times everywhere. */
    @Test
    public void theNotchAndThePhoneAlertsPassTheSameRepeatCasesAsThePlanner() throws Exception {
        JSONArray cases = new JSONArray(new String(Files.readAllBytes(repeatCases()), StandardCharsets.UTF_8));
        assertTrue("The shared repeat contract has cases", cases.length() > 0);
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i), task = c.getJSONObject("task"), expected = c.getJSONObject("expected");
            String id = c.getString("id");
            ZoneId zone = ZoneId.of(c.getString("timezone"));
            Set<String> completed = new HashSet<>();
            JSONArray done = task.optJSONArray("completedOccurrences");
            for (int j = 0; done != null && j < done.length(); j++) completed.add(done.getString(j));
            NotchDay.Task row = new NotchDay.Task(1, id, null, Instant.parse(task.getString("planned")), task.getInt("minutes"), Repeats.key(task), completed);
            long noon = LocalDate.parse(c.getString("day")).atTime(12, 0).atZone(zone).toInstant().toEpochMilli();
            List<String> keys = new ArrayList<>();
            for (NotchDay.Slot slot : NotchDay.today(Arrays.asList(row), noon, zone)) keys.add(Instant.ofEpochMilli(slot.start).toString());
            List<String> want = new ArrayList<>();
            JSONArray expectedKeys = expected.getJSONArray("keys");
            for (int j = 0; j < expectedKeys.length(); j++) want.add(Instant.parse(expectedKeys.getString(j)).toString());
            assertEquals(id + " notch occurrences", want, keys);
            assertEquals(id + " next alert", Instant.parse(expected.getString("nextAlert")).toEpochMilli(),
                    CompanionAlerts.next(task, zone, Instant.parse(c.getString("now")).toEpochMilli()));
        }
    }
}

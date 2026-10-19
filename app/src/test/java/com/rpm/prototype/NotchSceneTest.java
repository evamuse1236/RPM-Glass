package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.rpm.prototype.NotchScene.Look;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/** What the pill and panel say at one moment: time-left text, the hero and the small rows. */
public class NotchSceneTest {
    private static final ZoneId KOLKATA = ZoneId.of("Asia/Kolkata");

    private static long at(String local) {
        return LocalDateTime.parse(local).atZone(KOLKATA).toInstant().toEpochMilli();
    }

    private static String iso(String local) {
        return java.time.Instant.ofEpochMilli(at(local)).toString();
    }

    private static JSONObject task(long id, String title, String local, int minutes) throws Exception {
        return new JSONObject().put("id", id).put("title", title).put("raw", title).put("kind", "plan")
                .put("planned", iso(local)).put("minutes", minutes).put("blockId", "b1");
    }

    private static NotchData day(boolean body, JSONArray events) throws Exception {
        JSONObject planner = new JSONObject().put("blocks", new JSONArray().put(new JSONObject().put("id", "b1").put("title", "Study")));
        if (body) {
            JSONObject water = new JSONObject().put("settings", new JSONObject().put("goal", 8))
                    .put("glasses", new JSONArray().put(iso("2026-10-18T08:30")).put(iso("2026-10-18T10:30")));
            JSONObject routine = new JSONObject().put("id", "r1").put("name", "Evening routine").put("start", "16:00").put("end", "17:00")
                    .put("days", new JSONArray().put(0)).put("steps", new JSONArray()
                            .put(new JSONObject().put("id", "s1").put("title", "Tidy desk"))
                            .put(new JSONObject().put("id", "s2").put("title", "Walk")));
            planner.put("body", new JSONObject().put("water", water).put("routines", new JSONArray().put(routine)).put("meals", new JSONArray()));
        }
        JSONArray entries = new JSONArray()
                .put(task(1, "Write RM essay", "2026-10-18T15:30", 45))
                .put(task(2, "Call Prof. Rao", "2026-10-18T16:30", 30))
                .put(task(3, "Gym", "2026-10-18T19:00", 60));
        return NotchData.parse(new JSONObject().put("version", 1).put("entries", entries).put("planner", planner), events);
    }

    private static NotchScene scene(NotchData data, String local) {
        return scene(data, local, Collections.emptyMap());
    }

    private static NotchScene scene(NotchData data, String local, Map<String, Long> snoozes) {
        return new NotchScene(data, at(local), snoozes, KOLKATA, false);
    }

    @Test
    public void runningTaskShowsTimeLeftEverywhere() throws Exception {
        NotchScene s = scene(day(true, null), "2026-10-18T15:50");
        assertEquals("25m", s.pillValue);
        assertEquals("Write RM essay", s.heroTitle);
        assertEquals("Study · 25 min left", s.heroSubtitle);
        assertEquals("20m", s.barStart);
        assertEquals("-25m", s.barEnd);
        assertEquals(20 / 45f, s.progress, 0.001);
        assertEquals("Write RM essay, 25 min left", s.spoken);
        assertTrue(s.canDone());
        assertFalse(s.canDrink());
    }

    @Test
    public void betweenItemsThePillShowsWhenTheNextStarts() throws Exception {
        NotchScene s = scene(day(false, null), "2026-10-18T16:20");
        assertEquals("4:30 PM", s.pillValue);
        assertEquals("Study · 4:30 PM, in 10 min", s.heroSubtitle);
        assertEquals("30m", s.barEnd);
        assertEquals(0, s.progress, 0);
    }

    @Test
    public void rowsAreNextItemThenDueWaterThenNudgesAtMostThree() throws Exception {
        NotchScene s = scene(day(true, null), "2026-10-18T16:05");
        assertEquals(3, s.rows.size());
        assertEquals("Call Prof. Rao", s.rows.get(0).title);
        assertEquals("4:30 PM", s.rows.get(0).value);
        assertEquals("the island shows two small rows, so due water must be one of them", Look.WATER, s.rows.get(1).look);
        assertEquals("2 of 8 · due", s.rows.get(1).value);
        assertEquals(Look.HABIT, s.rows.get(2).look);
        assertEquals("0 of 2", s.rows.get(2).value);
        assertTrue(s.waterDue());
        assertEquals("2/8", s.waterValue());
        assertEquals("0/2", NotchScene.habitValue(s.habit));
    }

    @Test
    public void withoutBodyDataOnlyTheDayShows() throws Exception {
        NotchScene s = scene(day(false, null), "2026-10-18T15:50");
        assertNull(s.water);
        assertNull(s.habit);
        assertNull(s.meal);
        assertFalse(s.canLogMeal);
        assertFalse(s.canSnooze());
        assertEquals(2, s.rows.size());
    }

    @Test
    public void snoozeHoldsWaterAndTheRoutineHere() throws Exception {
        Map<String, Long> snoozes = new HashMap<>();
        snoozes.put(NotchScene.WATER_SNOOZE, at("2026-10-18T16:20"));
        snoozes.put(NotchScene.routineSnooze("r1"), at("2026-10-18T16:20"));
        NotchScene held = scene(day(true, null), "2026-10-18T16:05", snoozes);
        assertFalse(held.waterDue());
        assertNull(held.habit);
        assertTrue(scene(day(true, null), "2026-10-18T16:25", snoozes).waterDue());
    }

    @Test
    public void aCalendarEventIsFixedAndARunningTaskBeatsIt() throws Exception {
        JSONArray events = new JSONArray().put(new JSONObject().put("start", at("2026-10-18T15:00")).put("end", at("2026-10-18T18:00"))
                .put("title", "Seminar").put("allDay", false).put("busy", false));
        NotchScene during = scene(day(false, events), "2026-10-18T15:50");
        assertEquals("Write RM essay", during.heroTitle);
        NotchScene after = scene(day(false, events), "2026-10-18T17:30");
        assertEquals("Seminar", after.heroTitle);
        assertEquals(Look.EVENT, after.heroLook);
        assertEquals("30m", after.pillValue);
        assertFalse(after.canDone());
    }

    @Test
    public void noTaskLeftAndWaterDueMakesWaterTheHero() throws Exception {
        NotchScene s = scene(day(true, null), "2026-10-18T21:00");
        assertNull(s.hero);
        assertEquals(Look.WATER, s.heroLook);
        assertEquals("2 of 8 glasses today · due now", s.heroSubtitle);
        assertTrue(s.canDrink());
        assertFalse(s.canDone());
        assertEquals("Dinner", s.rows.get(s.rows.size() - 1).title);
        assertEquals("Not logged", s.rows.get(s.rows.size() - 1).value);
    }

    @Test
    public void remindersOffKeepTheWaterCountWithoutANudge() throws Exception {
        JSONObject water = new JSONObject().put("settings", new JSONObject().put("reminders", false))
                .put("glasses", new JSONArray().put(iso("2026-10-18T08:30")));
        JSONObject store = new JSONObject().put("planner", new JSONObject().put("body", new JSONObject().put("water", water)));
        NotchScene s = scene(NotchData.parse(store, null), "2026-10-18T16:00");
        assertEquals(1, s.water.count);
        assertEquals(8, s.water.goal);
        assertEquals(0, s.water.nextAt);
        assertFalse(s.waterDue());
        assertFalse(s.canSnooze());
        assertTrue(s.canDrink());
        assertEquals("1 of 8 glasses today", s.heroSubtitle);
    }

    @Test
    public void aPlannedSnackShowsItsSavedName() throws Exception {
        JSONObject snack = new JSONObject().put("slot", "snack").put("at", "16:00").put("on", true).put("name", "  Tea and fruit  ");
        JSONObject body = new JSONObject().put("mealPlan", new JSONObject().put("slots", new JSONArray().put(snack)));
        NotchScene s = scene(NotchData.parse(new JSONObject().put("planner", new JSONObject().put("body", body)), null), "2026-10-18T16:30");
        assertEquals("snack", s.meal);
        assertEquals(1, s.rows.size());
        assertEquals(Look.MEAL, s.rows.get(0).look);
        assertEquals("Tea and fruit", s.rows.get(0).title);
        assertEquals("Not logged", s.rows.get(0).value);
    }
}

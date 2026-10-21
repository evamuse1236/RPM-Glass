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
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
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
        assertEquals("the line is the block; the band has the time", "Study", s.heroSubtitle);
        assertEquals(20 / 45f, s.progress, 0.001);
        assertEquals("Write RM essay, 25 min left", s.spoken);
        assertTrue(s.canDone());
    }

    @Test
    public void theTimeShowsOnceTheLineIsThePurposeElseTheBlockElseNowOrNext() throws Exception {
        for (String local : new String[]{"2026-10-18T15:50", "2026-10-18T16:20"}) {
            NotchScene s = scene(day(true, null), local);
            assertFalse(local + ": " + s.heroSubtitle, s.heroSubtitle.matches(".*\\d.*"));
        }
        JSONArray entries = new JSONArray()
                .put(new JSONObject(task(1, "Write RM essay", "2026-10-18T15:30", 45).toString()).put("purpose", " So Sunday is calm ").put("blockId", JSONObject.NULL))
                .put(new JSONObject(task(2, "Call Prof. Rao", "2026-10-18T16:30", 30).toString()).put("blockId", JSONObject.NULL));
        NotchData bare = NotchData.parse(new JSONObject().put("version", 1).put("entries", entries).put("planner", new JSONObject()), null);
        assertEquals("So Sunday is calm", scene(bare, "2026-10-18T15:50").heroSubtitle);
        assertEquals("Next", scene(bare, "2026-10-18T16:20").heroSubtitle);
    }

    @Test
    public void betweenItemsThePillShowsWhenTheNextStarts() throws Exception {
        NotchScene s = scene(day(false, null), "2026-10-18T16:20");
        assertEquals("4:30", s.pillValue);
        assertEquals("Study", s.heroSubtitle);
        assertEquals(0, s.progress, 0);
    }

    @Test
    public void pillValueDropsAmPmWithinTwelveHours() throws Exception {
        assertEquals("4:30", scene(day(false, null), "2026-10-18T16:20").pillValue);
        assertEquals("more than 12 h away keeps AM/PM", "3:30 PM", scene(day(false, null), "2026-10-18T03:00").pillValue);
        assertEquals("3:30", scene(day(false, null), "2026-10-18T03:31").pillValue);
        assertEquals("16:30", new NotchScene(day(false, null), at("2026-10-18T16:20"), Collections.emptyMap(), KOLKATA, true).pillValue);
    }

    @Test
    public void theTaskIslandsRingFillsByTimeUsedAndAWaterOnlyEveningHasNoTaskHero() throws Exception {
        NotchScene running = scene(day(true, null), "2026-10-18T15:50");
        assertEquals("a running task fills by time used", 20 / 45f, running.progress, 0.001);
        assertEquals("25m", NotchBand.heroValue(running));
        assertEquals("an upcoming task stays empty", 0f, scene(day(true, null), "2026-10-18T16:20").progress, 0f);
        NotchScene evening = scene(day(true, null), "2026-10-18T21:00");
        assertNull(evening.heroLook);
        assertEquals(NotchHabits.Habit.WATER, evening.topHabit);
    }

    @Test
    public void heroHasOnePrimaryControlNeverDisabled() throws Exception {
        assertEquals(Collections.singletonList(NotchScene.Control.DONE), scene(day(true, null), "2026-10-18T15:50").controls());
        JSONArray events = new JSONArray().put(new JSONObject().put("start", at("2026-10-18T15:00")).put("end", at("2026-10-18T18:00"))
                .put("title", "Seminar").put("allDay", false).put("busy", false));
        assertTrue("a calendar event hides Done instead of greying it", scene(day(false, events), "2026-10-18T17:30").controls().isEmpty());
        assertEquals(Arrays.asList(NotchScene.Control.GLASS, NotchScene.Control.LATER), scene(day(true, null), "2026-10-18T21:00").habitControls());
        for (String local : new String[]{"2026-10-18T15:50", "2026-10-18T16:05", "2026-10-18T21:00"}) {
            NotchScene s = scene(day(true, null), local);
            assertTrue("the task island has at most Done", s.controls().size() <= 1);
            List<NotchScene.Control> c = s.habitControls();
            assertTrue("the habit island has a primary and Later, or nothing", c.isEmpty() || (c.size() == 2 && c.get(1) == NotchScene.Control.LATER));
        }
    }

    @Test
    public void dueWaterCanAlwaysBeLoggedFromTheNotch() throws Exception {
        for (String local : new String[]{"2026-10-18T15:50", "2026-10-18T16:05", "2026-10-18T16:20", "2026-10-18T21:00"}) {
            NotchScene s = scene(day(true, null), local);
            if (!s.waterDue()) continue;
            for (int rows = 1; rows <= 3; rows++) {
                boolean glass = s.topHabit == NotchHabits.Habit.WATER && s.habitControls().get(0) == NotchScene.Control.GLASS;
                for (NotchScene.Row r : s.visibleRows(rows)) glass |= r.look == Look.WATER;
                assertTrue(local + " with " + rows + " rows", glass);
                assertTrue(s.visibleRows(rows).size() <= rows);
            }
        }
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
    public void theIslandSaysHowManyOfTodaysItemsItLeavesOut() throws Exception {
        NotchScene s = scene(day(true, null), "2026-10-18T16:05");
        assertEquals("Gym is past the three rows", 1, s.more(3));
        assertEquals("at large text two rows drop as well", 3, s.more(1));
        NotchScene few = scene(day(false, null), "2026-10-18T15:50");
        assertEquals(0, few.more(3));
        assertEquals(1, few.more(1));
    }

    @Test
    public void iconsGrowWithTheTextUpToOneAndAHalfTimes() {
        assertEquals(1f, NotchParts.iconScale(0.85f), 0f);
        assertEquals(1f, NotchParts.iconScale(1f), 0f);
        assertEquals(1.3f, NotchParts.iconScale(1.3f), 0f);
        assertEquals(1.5f, NotchParts.iconScale(1.8f), 0f);
        assertEquals(1.5f, NotchParts.iconScale(2f), 0f);
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
    public void noTaskLeftAndWaterDueMakesWaterTheHabitDrop() throws Exception {
        NotchScene s = scene(day(true, null), "2026-10-18T21:00");
        assertNull(s.hero);
        assertNull(s.heroLook);
        assertEquals(NotchHabits.Habit.WATER, s.topHabit);
        assertEquals("2 of 8 glasses", s.habitLine());
        assertEquals(Arrays.asList(NotchScene.Control.GLASS, NotchScene.Control.LATER), s.habitControls());
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
        assertNull("water that is not due shows no habit drop", s.topHabit);
        assertTrue(s.habitControls().isEmpty());
    }

    @Test
    public void laterOnAMealHoldsOnlyThatMealAndWaterStillComesFirst() throws Exception {
        JSONObject dinner = new JSONObject().put("slot", "dinner").put("at", "20:00").put("on", true);
        JSONObject body = new JSONObject().put("mealPlan", new JSONObject().put("slots", new JSONArray().put(dinner)))
                .put("water", new JSONObject().put("settings", new JSONObject().put("reminders", false)));
        NotchData data = NotchData.parse(new JSONObject().put("planner", new JSONObject().put("body", body)), null);
        NotchScene due = scene(data, "2026-10-18T20:30");
        assertEquals(NotchHabits.Habit.MEAL, due.topHabit);
        assertEquals(Arrays.asList(NotchScene.Control.LOG_MEAL, NotchScene.Control.LATER), due.habitControls());
        assertEquals("Dinner not logged", due.habitLine());
        Map<String, Long> snoozes = new HashMap<>();
        snoozes.put(NotchScene.mealSnooze("dinner"), at("2026-10-18T20:45"));
        assertNull(scene(data, "2026-10-18T20:30", snoozes).topHabit);
        assertEquals(NotchHabits.Habit.MEAL, scene(data, "2026-10-18T20:46", snoozes).topHabit);
        assertEquals(NotchHabits.Habit.WATER, NotchHabits.top(true, "dinner"));
        assertEquals(NotchHabits.Habit.MEAL, NotchHabits.top(false, "dinner"));
        assertNull(NotchHabits.top(false, null));
    }

    @Test
    public void aPlannedSnackShowsItsSavedName() throws Exception {
        JSONObject snack = new JSONObject().put("slot", "snack").put("at", "16:00").put("on", true).put("name", "  Tea and fruit  ");
        JSONObject body = new JSONObject().put("mealPlan", new JSONObject().put("slots", new JSONArray().put(snack)));
        NotchScene s = scene(NotchData.parse(new JSONObject().put("planner", new JSONObject().put("body", body)), null), "2026-10-18T16:30");
        assertEquals("snack", s.meal);
        NotchScene.Row meal = s.rows.stream().filter(r -> r.look == Look.MEAL).findFirst().orElseThrow(AssertionError::new);
        assertEquals("Tea and fruit", meal.title);
        assertEquals("Not logged", meal.value);
        assertEquals("Tea and fruit", s.mealTitle);
    }
}

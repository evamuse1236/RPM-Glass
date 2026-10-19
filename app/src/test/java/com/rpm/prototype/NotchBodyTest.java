package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

/** The data reader: planner.body as body-store.mjs writes it, and timed tasks and calendar events from the store. */
public class NotchBodyTest {
    private static final ZoneId KOLKATA = ZoneId.of("Asia/Kolkata");

    private static long at(String local) {
        return LocalDateTime.parse(local).atZone(KOLKATA).toInstant().toEpochMilli();
    }

    /** Sunday 18 Oct 2026, Kolkata (UTC+5:30). */
    private static final String BODY = "{"
            + "\"schema\":1,"
            + "\"routines\":["
            + "{\"id\":\"r1\",\"name\":\"Morning routine\",\"start\":\"7:00\",\"end\":\"08:00\",\"days\":[0,6],"
            + "\"steps\":[{\"id\":\"s1\",\"title\":\"Water\"},{\"id\":\"s2\",\"title\":\"Stretch\"},{\"id\":\"s3\",\"title\":\"Journal\"}]},"
            + "{\"id\":\"r2\",\"name\":\"Weekday wind-down\",\"start\":\"21:00\",\"end\":\"22:00\",\"days\":[1,2,3,4,5],"
            + "\"steps\":[{\"id\":\"w1\",\"title\":\"Read\"}]},"
            + "{\"id\":\"r3\",\"name\":\"Old\",\"start\":\"09:00\",\"end\":\"10:00\",\"days\":[0],\"steps\":[{\"id\":\"o1\",\"title\":\"x\"}],\"archived\":true}],"
            + "\"runs\":[{\"routineId\":\"r1\",\"day\":\"2026-10-18\",\"marks\":{\"s1\":{\"state\":\"done\",\"at\":\"2026-10-18T01:35:00.000Z\"}}}],"
            + "\"water\":{\"settings\":{\"goal\":8,\"intervalMinutes\":90,\"from\":\"08:00\",\"until\":\"22:00\",\"glassMl\":250,"
            + "\"snoozeMinutes\":10,\"reminders\":true},"
            + "\"glasses\":[\"2026-10-18T03:00:00.000Z\",\"2026-10-18T05:00:00.000Z\",\"2026-10-17T05:00:00.000Z\"],\"snoozedUntil\":null},"
            + "\"meals\":[{\"id\":\"m1\",\"name\":\"Poha\",\"slot\":\"breakfast\",\"at\":\"2026-10-18T02:30:00.000Z\",\"created\":\"x\"}],"
            + "\"mealGuesses\":{}}";

    private static JSONObject store(String body) throws Exception {
        JSONObject planner = new JSONObject().put("blocks", new JSONArray().put(new JSONObject().put("id", "b1").put("title", "Study")));
        if (body != null) planner.put("body", new JSONObject(body));
        JSONArray entries = new JSONArray()
                .put(new JSONObject().put("id", 4).put("title", "Write RM essay").put("raw", "essay").put("kind", "plan")
                        .put("planned", "2026-10-18T10:00:00.000Z").put("minutes", 45).put("blockId", "b1"))
                .put(new JSONObject().put("id", 5).put("title", "Done already").put("raw", "x").put("kind", "plan")
                        .put("planned", "2026-10-18T10:00:00.000Z").put("done", true))
                .put(new JSONObject().put("id", 6).put("title", "Someday").put("raw", "x").put("kind", "plan"));
        return new JSONObject().put("version", 3).put("entries", entries).put("planner", planner);
    }

    @Test
    public void readsWaterRoutinesAndMealsFromPlannerBody() throws Exception {
        NotchBody body = NotchBody.parse(store(BODY));
        assertTrue(body.present);
        assertEquals(3, body.glasses.size());
        assertEquals(10, body.water.snoozeMinutes);
        assertTrue(body.water.reminders);
        assertEquals(0, body.waterSnoozedUntil);
        assertEquals(2, body.routines.size());
        NotchBody.Routine morning = body.routines.get(0);
        assertEquals("Morning routine", morning.name);
        assertEquals(7 * 60, morning.start);
        assertTrue(morning.days.contains(0));
        assertEquals("done", body.run("r1", "2026-10-18").marks.get("s1"));
        assertNull(body.run("r1", "2026-10-17"));
        assertEquals(1, body.meals.size());
        assertEquals("breakfast", body.meals.get(0).slot);
    }

    @Test
    public void noBodyMeansNoWaterRoutinesOrMeals() throws Exception {
        assertSame(NotchBody.ABSENT, NotchBody.parse(store(null)));
        assertSame(NotchBody.ABSENT, NotchBody.parse(null));
        assertFalse(NotchBody.ABSENT.present);
    }

    @Test
    public void routineStepsAreDueInsideTheWindow() throws Exception {
        NotchBody body = NotchBody.parse(store(BODY));
        List<NotchHabits.RoutineStatus> early = NotchHabits.routines(body, at("2026-10-18T06:30"), KOLKATA);
        assertEquals(1, early.size());
        assertEquals("running", early.get(0).state);
        assertFalse("touched early, but the window has not opened", early.get(0).dueAt(at("2026-10-18T06:30")));
        NotchHabits.RoutineStatus now = NotchHabits.routines(body, at("2026-10-18T07:20"), KOLKATA).get(0);
        assertTrue(now.dueAt(at("2026-10-18T07:20")));
        assertEquals(1, now.done);
        assertEquals(3, now.total);
        assertEquals("Stretch", now.nextStep);
        assertEquals("partly", NotchHabits.routines(body, at("2026-10-18T08:30"), KOLKATA).get(0).state);
    }

    @Test
    public void mealNotLoggedFollowsThePlanForToday() throws Exception {
        NotchBody body = NotchBody.parse(store(BODY));
        assertNull(NotchHabits.unloggedMeal(body, at("2026-10-18T09:00"), KOLKATA));
        assertEquals("lunch", NotchHabits.unloggedMeal(body, at("2026-10-18T13:00"), KOLKATA));
        assertEquals("Lunch", NotchHabits.slotName("lunch"));
        assertEquals("dinner", NotchHabits.slot(at("2026-10-18T02:00"), KOLKATA));
    }

    @Test
    public void rawWaterStatusKeepsPlannerTimingWhenRemindersAreOff() throws Exception {
        NotchBody body = NotchBody.parse(store(BODY.replace("\"reminders\":true", "\"reminders\":false")));
        NotchWater.Status s = NotchWater.status(body.glasses, body.water, java.util.Collections.emptyList(), 0, at("2026-10-18T20:00"), KOLKATA);
        assertEquals(2, s.count);
        assertTrue(s.pending);
        assertEquals(at("2026-10-18T12:00"), s.nextAt);
    }

    @Test
    public void openTimedTasksAndCalendarEventsBecomeTheDay() throws Exception {
        JSONArray events = new JSONArray()
                .put(new JSONObject().put("start", at("2026-10-18T16:00")).put("end", at("2026-10-18T17:00")).put("title", "Seminar").put("allDay", false).put("busy", true))
                .put(new JSONObject().put("start", at("2026-10-18T00:00")).put("end", at("2026-10-19T00:00")).put("title", "Holiday").put("allDay", true));
        NotchData data = NotchData.parse(store(BODY), events);
        assertEquals(2, data.tasks.size());
        NotchDay.Task essay = data.tasks.get(0);
        assertEquals(4, essay.id);
        assertEquals("Study", essay.block);
        assertEquals(45, essay.minutes);
        assertFalse(essay.fixed);
        NotchDay.Task seminar = data.tasks.get(1);
        assertTrue(seminar.fixed);
        assertEquals(60, seminar.minutes);
        assertEquals(1, data.busy.size());
        assertEquals(0, NotchData.parse(null, null).tasks.size());
    }
}

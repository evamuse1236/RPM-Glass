package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

public class NotchHabitsTest {
    private static Path fixture() {
        for (Path dir = Paths.get("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path file = dir.resolve("fixtures/habit-cases.json");
            if (Files.isRegularFile(file)) return file;
        }
        throw new AssertionError("Cannot find fixtures/habit-cases.json from " + Paths.get("").toAbsolutePath());
    }

    @Test
    public void plannerAndNotchPassTheSameHabitCases() throws Exception {
        JSONArray cases = new JSONArray(new String(Files.readAllBytes(fixture()), StandardCharsets.UTF_8));
        assertTrue("The shared habit contract has cases", cases.length() > 0);
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i), expected = c.getJSONObject("expected");
            String id = c.getString("id");
            NotchBody body = NotchBody.parse(new JSONObject().put("planner", new JSONObject().put("body", c.getJSONObject("body"))));
            long now = Instant.parse(c.getString("now")).toEpochMilli();
            ZoneId zone = ZoneId.of(c.getString("timezone"));
            List<NotchWater.Busy> busy = new ArrayList<>();
            JSONArray events = c.getJSONArray("busy");
            for (int j = 0; j < events.length(); j++) {
                JSONObject event = events.getJSONObject(j);
                busy.add(new NotchWater.Busy(Instant.parse(event.getString("start")).toEpochMilli(), Instant.parse(event.getString("end")).toEpochMilli()));
            }
            NotchWater.Status water = NotchWater.status(body.glasses, body.water, busy, body.waterSnoozedUntil, now, zone);
            JSONObject expectedWater = expected.getJSONObject("water");
            assertEquals(id + " water count", expectedWater.getInt("count"), water.count);
            assertEquals(id + " water goal", expectedWater.getInt("goal"), water.goal);
            long nextAt = expectedWater.isNull("nextAt") ? 0 : Instant.parse(expectedWater.getString("nextAt")).toEpochMilli();
            assertEquals(id + " water nextAt", nextAt, water.nextAt);
            assertEquals(id + " water pending", expectedWater.getBoolean("pending"), water.pending);
            assertEquals(id + " eligible meal", expected.isNull("meal") ? null : expected.getString("meal"), NotchHabits.unloggedMeal(body, now, zone));
            NotchHabits.Habit top = NotchHabits.top(water.pending, NotchHabits.unloggedMeal(body, now, zone));
            assertEquals(id + " top habit", expected.isNull("top") ? null : expected.getString("top"), top == null ? null : top.name().toLowerCase(java.util.Locale.ROOT));
            if (expected.has("mealPlan")) {
                JSONArray plan = expected.getJSONArray("mealPlan");
                assertEquals(id + " meal plan size", plan.length(), body.mealPlan.size());
                for (int j = 0; j < plan.length(); j++) {
                    JSONObject slot = plan.getJSONObject(j);
                    NotchBody.MealSlot actual = body.mealPlan.get(j);
                    assertEquals(id + " meal slot", slot.getString("slot"), actual.slot);
                    assertEquals(id + " meal time", slot.getString("at"), LocalTime.of(actual.at / 60, actual.at % 60).toString());
                    assertEquals(id + " meal enabled", slot.getBoolean("on"), actual.on);
                    assertEquals(id + " meal name", slot.getString("name"), actual.name);
                }
            }
        }
    }
}

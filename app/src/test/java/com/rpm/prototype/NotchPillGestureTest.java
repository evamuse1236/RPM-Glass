package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.SharedPreferences;
import java.lang.reflect.Proxy;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class NotchPillGestureTest {
    private static final long NOW = Instant.parse("2026-10-18T15:00:00Z").toEpochMilli();
    private static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    @Test
    public void upOnWaterWritesItsSnoozeAndHidesTheDropWithoutLogging() throws Exception {
        assertLater(IslandGesture.Result.UP, true);
    }

    @Test
    public void upOnAMealWritesOnlyItsSnoozeAndHidesTheDrop() throws Exception {
        assertLater(IslandGesture.Result.UP, false);
    }

    @Test
    public void leftAndRightMeanLaterForWaterAndMeals() throws Exception {
        for (IslandGesture.Result gesture : new IslandGesture.Result[]{IslandGesture.Result.LEFT, IslandGesture.Result.RIGHT}) {
            assertLater(gesture, true);
            assertLater(gesture, false);
        }
    }

    @Test
    public void tapAndDownStillOpenAndLongPressStillHolds() {
        assertEquals(IslandGesture.PillAction.OPEN, IslandGesture.pillAction(IslandGesture.Result.TAP));
        assertEquals(IslandGesture.PillAction.OPEN, IslandGesture.pillAction(IslandGesture.Result.DOWN));
        assertEquals(IslandGesture.PillAction.HOLD, IslandGesture.pillAction(IslandGesture.Result.LONG_PRESS));
        assertEquals(IslandGesture.PillAction.NONE, IslandGesture.pillAction(IslandGesture.Result.NONE));
    }

    private static void assertLater(IslandGesture.Result gesture, boolean water) throws Exception {
        JSONObject body = new JSONObject()
                .put("water", new JSONObject().put("settings", new JSONObject().put("reminders", water)))
                .put("mealPlan", new JSONObject().put("slots", new JSONArray().put(
                        new JSONObject().put("slot", "dinner").put("at", "20:00").put("on", !water))));
        NotchData data = NotchData.parse(new JSONObject().put("planner", new JSONObject().put("body", body)), null);
        Map<String, Long> saved = new HashMap<>();
        Map<String, Long> snoozes = new HashMap<>();
        SharedPreferences prefs = preferences(saved);
        NotchScene due = new NotchScene(data, NOW, snoozes, ZONE, false);
        assertTrue(new NotchFrame(NotchFrame.Mode.PILL, due, null, null).habitDrop());
        assertEquals(IslandGesture.PillAction.LATER, IslandGesture.pillAction(gesture));
        assertTrue(NotchSnooze.later(due, prefs, NOW));
        String key = water ? "water" : "meal:dinner";
        assertEquals(Long.valueOf(NOW + 15 * 60_000L), saved.get("snooze:" + key));
        assertEquals(1, saved.size());
        saved.forEach((k, v) -> snoozes.put(k.substring("snooze:".length()), v));
        NotchScene held = new NotchScene(data, NOW, snoozes, ZONE, false);
        assertFalse(new NotchFrame(NotchFrame.Mode.PILL, held, null, null).showsPill());
        assertEquals(due.water.count, held.water.count);
        assertNotNull(new NotchScene(data, NOW + 15 * 60_000L, snoozes, ZONE, false).topHabit);
    }

    private static SharedPreferences preferences(Map<String, Long> saved) {
        Map<String, Long> pending = new HashMap<>();
        SharedPreferences.Editor editor = (SharedPreferences.Editor) Proxy.newProxyInstance(
                SharedPreferences.Editor.class.getClassLoader(), new Class<?>[]{SharedPreferences.Editor.class},
                (proxy, method, args) -> {
                    if (method.getName().equals("putLong")) {
                        pending.put((String) args[0], (Long) args[1]);
                        return proxy;
                    }
                    if (method.getName().equals("apply")) {
                        saved.putAll(pending);
                        return null;
                    }
                    throw new AssertionError(method.getName());
                });
        return (SharedPreferences) Proxy.newProxyInstance(SharedPreferences.class.getClassLoader(),
                new Class<?>[]{SharedPreferences.class}, (proxy, method, args) -> {
                    if (method.getName().equals("edit")) return editor;
                    throw new AssertionError(method.getName());
                });
    }
}

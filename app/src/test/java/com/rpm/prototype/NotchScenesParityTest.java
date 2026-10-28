package com.rpm.prototype;

import com.rpm.prototype.NotchOffer.Act;
import com.rpm.prototype.NotchOffer.Hero;
import com.rpm.prototype.NotchOffer.Inputs;
import com.rpm.prototype.NotchOffer.LocalState;
import com.rpm.prototype.NotchOffer.Look;
import com.rpm.prototype.NotchOffer.Trail;
import com.rpm.prototype.NotchOffer.Meter;
import com.rpm.prototype.NotchOffer.Art;
import com.rpm.prototype.NotchOffer.Row;
import com.rpm.prototype.NotchOffer.Scene;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.JUnitCore;
import org.junit.runner.Result;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Replays every scene NotchSceneTest and NotchAlertRowsTest build, and checks the module arbiter draws the same island. */
public class NotchScenesParityTest {
    private static final Look[] LOOKS = {Look.TASK, Look.EVENT, Look.WATER, Look.HABIT,
            Look.MEAL, Look.REMINDER, Look.ALARM};
    private static final String[] LOOK_NAMES = {"TASK", "EVENT", "WATER", "HABIT", "MEAL", "REMINDER", "ALARM"};

    @Test
    public void theArbiterDrawsEverySceneTheOldNotchDrew() {
        List<SceneCases.Case> cases = recordedCases();
        for (SceneCases.Case c : cases) {
            NotchScene old = new NotchScene(c.data(), c.now(), c.snoozes(), c.zone(), c.h24());
            Inputs in = Inputs.of(c.data(), c.now(), c.zone(), c.h24());
            Map<String, LocalState> local = NotchModules.fromSnoozes(c.snoozes());
            Scene scene = NotchModules.scene(in, local);
            assertSame(c.name(), old, scene, in);

            Act.Local later = (Act.Local) scene.later();
            if (later == null) continue;
            Map<String, Long> snoozed = new HashMap<>(c.snoozes());
            snoozed.put(oldSnoozeKey(later), c.now() + old.snoozeMinutes * 60_000L);
            NotchScene oldAfter = new NotchScene(c.data(), c.now(), snoozed, c.zone(), c.h24());
            Scene after = NotchModules.scene(in, NotchModules.apply(later, in, local));
            assertSame(c.name() + " after Later", oldAfter, after, in);
        }
    }

    @Test
    public void theArbiterPassesTheSharedHabitCases() throws Exception {
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
            Scene scene = NotchModules.scene(new Inputs(now, zone, false, List.of(), busy, body, LocalState.EMPTY), Map.of());
            assertTrue(id + " no module failed", scene.failed().isEmpty());

            JSONObject water = expected.getJSONObject("water");
            Row waterRow = scene.rows().stream().filter(r -> r.look().equals(Look.WATER)).findFirst().orElseThrow();
            assertEquals(id + " water row", new Trail.Dots(water.getInt("count"), water.getInt("goal")), waterRow.trail().get(0));
            boolean waterDue = water.getBoolean("pending") && body.water.reminders;
            assertEquals(id + " water due", waterDue, waterRow.due());

            String meal = expected.isNull("meal") ? null : expected.getString("meal");
            String nudge = scene.nudge() == null ? null : scene.nudge().module();
            if (waterDue) assertEquals(id + " nudge", WaterModule.ID, nudge);
            else if (meal != null) assertEquals(id + " nudge", MealsModule.ID, nudge);
            else assertTrue(id + " no habit nudge, got " + nudge, nudge == null || nudge.equals(RoutinesModule.ID));
            if (MealsModule.ID.equals(nudge)) assertEquals(id + " meal", meal, ((Act.Local) scene.later()).arg());
        }
    }

    /** Deliberate change: the old notch gave a same-start tie to the event; the registry order gives it to the task. */
    @Test
    public void aTaskAndAnEventAtTheSameStartGiveTheHeroToTheTask() throws Exception {
        ZoneId zone = ZoneId.of("Asia/Kolkata");
        long start = java.time.LocalDateTime.parse("2026-10-18T16:30").atZone(zone).toInstant().toEpochMilli();
        JSONArray events = new JSONArray().put(new JSONObject().put("start", start).put("end", start + 3_600_000L)
                .put("title", "Seminar").put("allDay", false).put("busy", false));
        JSONObject task = new JSONObject().put("id", 2).put("title", "Call Prof. Rao").put("raw", "Call Prof. Rao")
                .put("kind", "plan").put("planned", Instant.ofEpochMilli(start).toString()).put("minutes", 30).put("blockId", "b1");
        JSONObject planner = new JSONObject().put("blocks", new JSONArray().put(new JSONObject().put("id", "b1").put("title", "Study")))
                .put("body", QuietBody.body());
        NotchData data = NotchData.parse(new JSONObject().put("version", 1).put("entries", new JSONArray().put(task))
                .put("planner", planner), events);
        long now = start - 600_000L;

        assertEquals("Seminar", new NotchScene(data, now, Map.of(), zone, false).heroTitle);
        Scene scene = NotchModules.scene(Inputs.of(data, now, zone, false), Map.of());
        assertEquals("Call Prof. Rao", scene.hero().value().title());
        assertEquals("Seminar", scene.visible(3).get(0).title());
    }

    private static List<SceneCases.Case> recordedCases() {
        SceneCases.SEEN.clear();
        Result run = JUnitCore.runClasses(NotchSceneTest.class, NotchAlertRowsTest.class);
        assertTrue("The old scene tests pass: " + run.getFailures(), run.wasSuccessful());
        List<SceneCases.Case> cases = List.copyOf(SceneCases.SEEN);
        SceneCases.SEEN.clear();
        assertTrue("The old scene tests built scenes", cases.size() > 10);
        return cases;
    }

    private static void assertSame(String name, NotchScene old, Scene scene, Inputs in) {
        assertEquals(name + " failed modules", List.of(), scene.failed());
        assertEquals(name + " hero", oldHero(old), newHero(scene));
        assertEquals(name + " task drop", oldTaskDrop(old), scene.taskDrop());
        assertEquals(name + " habit drop", oldHabitDrop(old), scene.habitDrop());
        assertEquals(name + " later", oldLater(old), newLater(scene));
        for (int n = 0; n <= 3; n++) {
            List<String> was = new ArrayList<>();
            for (NotchScene.Row r : old.visibleRows(n)) was.add(r.look.name() + "|" + r.title + "|" + r.value + "|" + (r.heros ? "hero" : Objects.toString(r.alert, "")));
            List<String> now = new ArrayList<>();
            for (Row r : scene.visible(n)) now.add(row(r, in));
            assertEquals(name + " rows at " + n, was, now);
            assertEquals(name + " more at " + n, old.more(n), scene.more(n));
        }
    }

    private static String oldHero(NotchScene s) {
        if (s.hero == null) return null;
        return String.join("|", s.heroLook.name(), s.heroTitle, s.heroSubtitle, s.pillValue, s.spoken, s.barSpoken,
                String.valueOf(Math.round(s.progress * 1000)), String.valueOf(s.running));
    }

    private static String newHero(Scene s) {
        if (s.hero() == null) return null;
        Hero h = s.hero().value();
        return String.join("|", lookName(h.look()), h.title(), h.line(), h.value(), h.spoken(), h.barSpoken(),
                String.valueOf(h.ringPermille()), String.valueOf(h.urgency() == Hero.Urgency.RUNNING));
    }

    private static Art oldTaskDrop(NotchScene s) {
        if (s.hero == null) return null;
        NotchDay.Task t = s.hero.task;
        return t.fixed ? new Art.Capsule(Art.NEUTRAL, TaskSymbol.EVENT_ICON) : new Art.Capsule(t.tone, TaskSymbol.icon(t.title));
    }

    private static Art oldHabitDrop(NotchScene s) {
        if (s.topHabit == NotchHabits.Habit.WATER) return new Art.Gauge(new Meter.Water(s.water.goal, s.water.count));
        if (s.topHabit == NotchHabits.Habit.MEAL) return new Art.Gauge(new Meter.Meals(s.meals.slots, s.meals.logged));
        return null;
    }

    private static String oldLater(NotchScene s) {
        if (!s.canSnooze()) return null;
        if (s.topHabit == NotchHabits.Habit.WATER) return WaterModule.ID + "|";
        if (s.topHabit == NotchHabits.Habit.MEAL) return MealsModule.ID + "|" + s.meal;
        return RoutinesModule.ID + "|" + s.habit.routine.id;
    }

    private static String newLater(Scene s) {
        Act.Local later = (Act.Local) s.later();
        return later == null ? null : later.module() + "|" + later.arg();
    }

    private static String oldSnoozeKey(Act.Local later) {
        return switch (later.module()) {
            case WaterModule.ID -> NotchScene.WATER_SNOOZE;
            case MealsModule.ID -> NotchScene.mealSnooze(later.arg());
            default -> NotchScene.routineSnooze(later.arg());
        };
    }

    /** The old Row's look, title, value and alert, read back from a new Row. */
    private static String row(Row r, Inputs in) {
        String look = lookName(r.look());
        String value = "", chip = "";
        if (r.place() == Row.Place.ATTACHED) {
            value = in.clock(r.at());
            chip = "hero";
        }
        for (Trail t : r.trail()) {
            if (t instanceof Trail.AlertChip a) {
                value = a.at();
                chip = a.alert();
            } else if (t instanceof Trail.Dots d) {
                value = d.count() + " of " + d.goal() + (r.due() ? " · due" : "");
            } else if (t instanceof Trail.Value v && value.isEmpty()) {
                value = r.look().equals(Look.HABIT) ? v.text().replace("/", " of ") : v.text();
            }
        }
        if (r.look().equals(Look.MEAL)) value = "Not logged";
        return look + "|" + r.title() + "|" + value + "|" + chip;
    }

    private static String lookName(Look look) {
        for (int i = 0; i < LOOKS.length; i++) if (LOOKS[i].equals(look)) return LOOK_NAMES[i];
        return String.valueOf(look);
    }

    private static Path fixture() {
        for (Path dir = Paths.get("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path file = dir.resolve("fixtures/habit-cases.json");
            if (Files.isRegularFile(file)) return file;
        }
        throw new AssertionError("Cannot find fixtures/habit-cases.json from " + Paths.get("").toAbsolutePath());
    }
}

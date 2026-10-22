package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.rpm.prototype.NotchFrame.Mode;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class NotchDropsTest {
    private static final ZoneId KOLKATA = ZoneId.of("Asia/Kolkata");

    private static long at(String local) {
        return LocalDateTime.parse(local).atZone(KOLKATA).toInstant().toEpochMilli();
    }

    private static String read(String path) throws Exception {
        return new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8);
    }

    @Test
    public void taskIconsFollowThePlannersTable() throws Exception {
        String js = read("../android-companion/task-symbol.mjs");
        Matcher row = Pattern.compile("\\['(\\w+)', \\[([^\\]]*)\\]\\]").matcher(js.substring(0, js.indexOf("TASK_SYMBOL")));
        List<String> symbols = new ArrayList<>();
        int i = 0;
        while (row.find()) {
            symbols.add(row.group(1));
            TaskSymbol.Entry e = TaskSymbol.SYMBOLS.get(i++);
            assertEquals(row.group(1), e.symbol);
            assertEquals(row.group(1), Arrays.asList(row.group(2).replace("'", "").split(",\\s*")), e.words);
        }
        assertEquals(TaskSymbol.SYMBOLS.size(), symbols.size());
        assertTrue(js.contains("export const TASK_SYMBOL = '" + TaskSymbol.TASK + "';"));
        assertEquals("call", TaskSymbol.symbol("Call Prof. Rao"));
        assertEquals("the first matching row wins", "groups", TaskSymbol.symbol("Call the team"));
        assertEquals("words, not parts of words", TaskSymbol.TASK, TaskSymbol.symbol("Recall dates"));
        assertEquals(R.drawable.sym_edit_note, TaskSymbol.icon("Write RM essay"));
        assertEquals(TaskSymbol.TASK_ICON, TaskSymbol.icon(null));
    }

    private static int css(String block, String name) {
        Matcher m = Pattern.compile("--" + Pattern.quote(name) + ":#([0-9a-f]{6})").matcher(block);
        assertTrue(name, m.find());
        return 0xFF000000 | Integer.parseInt(m.group(1), 16);
    }

    @Test
    public void tonesMatchThePlannersTheme() throws Exception {
        String theme = read("../android-companion/theme.css");
        String light = theme.substring(theme.indexOf(":root{"), theme.indexOf("@media (prefers-color-scheme:dark)"));
        String dark = theme.substring(theme.indexOf(":root[data-appearance=dark]{"));
        for (Object[] mode : new Object[][]{{light, Tones.LIGHT}, {dark, Tones.DARK}}) {
            String block = (String) mode[0];
            Tones t = (Tones) mode[1];
            for (int i = 0; i < 8; i++) assertEquals("area-" + i, css(block, "area-" + i), t.area[i]);
            assertEquals(css(block, "tone-water"), t.water);
            assertEquals(css(block, "tone-meal"), t.meal);
            assertEquals(css(block, "tone-routine"), t.routine);
            assertEquals(css(block, "on-tone"), t.onTone);
            assertEquals(css(block, "outline"), t.neutral);
            assertEquals(css(block, "on-surface"), t.onSurface);
        }
        assertEquals("no area is the neutral outline", Tones.DARK.neutral, Tones.DARK.task(-1));
        assertEquals(Tones.DARK.area[1], Tones.DARK.task(9));
        assertEquals(0x1F, Tones.DARK.onSurface(12) >>> 24);
    }

    @Test
    public void aTasksToneComesFromItsBlocksArea() throws Exception {
        JSONObject planner = new JSONObject()
                .put("areas", new JSONArray().put(new JSONObject().put("id", "a0")).put(new JSONObject().put("id", "a1").put("colorIndex", 5)))
                .put("goals", new JSONArray().put(new JSONObject().put("id", "g0").put("areaId", "a0")).put(new JSONObject().put("id", "g1").put("areaId", "a1")))
                .put("projects", new JSONArray().put(new JSONObject().put("id", "p0").put("goalId", "g0")).put(new JSONObject().put("id", "p1").put("goalId", "g1")))
                .put("blocks", new JSONArray().put(new JSONObject().put("id", "b0").put("projectId", "p0")).put(new JSONObject().put("id", "b1").put("projectId", "p1"))
                        .put(new JSONObject().put("id", "loose").put("projectId", JSONObject.NULL)));
        Map<String, Integer> tones = NotchData.tones(planner);
        assertEquals("an area without a colour takes its place in the list", Integer.valueOf(0), tones.get("b0"));
        assertEquals(Integer.valueOf(5), tones.get("b1"));
        assertFalse("a block without a project is neutral", tones.containsKey("loose"));
        JSONArray entries = new JSONArray()
                .put(new JSONObject().put("id", 1).put("title", "Essay").put("planned", "2026-10-18T10:00:00Z").put("minutes", 45).put("blockId", "b1"))
                .put(new JSONObject().put("id", 2).put("title", "Call").put("planned", "2026-10-18T11:00:00Z").put("minutes", 30));
        NotchData data = NotchData.parse(new JSONObject().put("entries", entries).put("planner", planner), null);
        assertEquals(5, data.tasks.get(0).tone);
        assertEquals(-1, data.tasks.get(1).tone);
    }

    @Test
    public void theHabitIslandIsItsOwnModeAndOpeningTheTaskIslandLeavesIt() {
        IslandState s = new IslandState();
        s.openHabit();
        assertEquals(Mode.HABIT, s.mode(null, null));
        assertEquals("a receipt takes the face", Mode.RECEIPT, s.mode(null, NotchReceipt.glass(1, 8, 0, true)));
        s.expand(true);
        assertEquals(Mode.OPEN, s.mode(null, null));
        s.openHabit();
        s.close();
        assertEquals(Mode.PILL, s.mode(null, null));
    }

    @Test
    public void theMealMeterCountsTodaysLoggedMealsAndNotSkippedOnes() throws Exception {
        JSONArray slots = new JSONArray();
        for (String[] slot : new String[][]{{"breakfast", "08:30"}, {"lunch", "13:00"}, {"snack", "16:00"}, {"dinner", "20:00"}}) {
            slots.put(new JSONObject().put("slot", slot[0]).put("at", slot[1]).put("on", !slot[0].equals("snack")));
        }
        JSONArray meals = new JSONArray()
                .put(new JSONObject().put("slot", "breakfast").put("at", java.time.Instant.ofEpochMilli(at("2026-10-18T08:40")).toString()))
                .put(new JSONObject().put("slot", "lunch").put("at", java.time.Instant.ofEpochMilli(at("2026-10-18T13:10")).toString()).put("state", "skipped"))
                .put(new JSONObject().put("slot", "dinner").put("at", java.time.Instant.ofEpochMilli(at("2026-10-17T20:10")).toString()));
        JSONObject body = new JSONObject().put("mealPlan", new JSONObject().put("slots", slots)).put("meals", meals)
                .put("water", new JSONObject().put("settings", new JSONObject().put("reminders", false)));
        NotchScene s = new NotchScene(NotchData.parse(new JSONObject().put("planner", new JSONObject().put("body", body)), null),
                at("2026-10-18T20:30"), Collections.emptyMap(), KOLKATA, false);
        assertEquals(Arrays.asList("breakfast", "lunch", "dinner"), s.meals.slots);
        assertEquals("yesterday's dinner and a skipped lunch do not fill the meter", Collections.singletonList(0), s.meals.logged);
        assertEquals(NotchHabits.Habit.MEAL, s.topHabit);
    }

    @Test
    public void aLoggedGlassTipsLikeAGlassSetDownThenSettles() {
        assertEquals(0f, GlassTip.at(0).level, 0f);
        assertEquals(0f, GlassTip.at(0).degrees, 0f);
        GlassTip early = GlassTip.at(200);
        assertTrue("it tips back first", early.degrees < 0f);
        assertTrue(early.level > 0f && early.level < 1f);
        float least = 0f, most = 0f;
        for (long t = 0; t <= GlassTip.MS; t += 10) {
            GlassTip g = GlassTip.at(t);
            least = Math.min(least, g.degrees);
            most = Math.max(most, g.degrees);
            assertTrue(g.level >= 0f && g.level <= 1f);
        }
        assertEquals(-11f, least, 0.5f);
        assertEquals(7f, most, 0.5f);
        assertEquals("the new segment is drawn first", 1f, GlassTip.at(GlassTip.SEGMENT_MS).segment, 0f);
        GlassTip end = GlassTip.at(GlassTip.MS);
        assertEquals(1f, end.level, 0f);
        assertEquals(0f, end.degrees, 0f);
        assertEquals(GlassTip.still().level, end.level, 0f);
        assertEquals(0.5f, GlassTip.bezier(0.42f, 0f, 0.58f, 1f, 0.5f), 0.01f);
    }
}

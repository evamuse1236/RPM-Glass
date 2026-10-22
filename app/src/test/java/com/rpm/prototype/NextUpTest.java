package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

public class NextUpTest {
    private static final ZoneId KOLKATA = ZoneId.of("Asia/Kolkata");

    private static long at(String local) {
        return LocalDateTime.parse(local).atZone(KOLKATA).toInstant().toEpochMilli();
    }

    private static NotchData day(int glasses) throws Exception {
        JSONArray entries = new JSONArray()
                .put(new JSONObject().put("id", 4).put("title", "Group call: merge sections").put("kind", "plan")
                        .put("planned", Instant.ofEpochMilli(at("2026-10-18T16:00")).toString()).put("minutes", 30).put("blockId", "b1"));
        JSONArray drunk = new JSONArray();
        for (int i = 0; i < glasses; i++) drunk.put(Instant.ofEpochMilli(at("2026-10-18T08:00") + i * 60_000L).toString());
        JSONObject planner = new JSONObject()
                .put("areas", new JSONArray().put(new JSONObject().put("id", "a").put("colorIndex", 2)))
                .put("goals", new JSONArray().put(new JSONObject().put("id", "g").put("areaId", "a")))
                .put("projects", new JSONArray().put(new JSONObject().put("id", "p").put("goalId", "g")))
                .put("blocks", new JSONArray().put(new JSONObject().put("id", "b1").put("projectId", "p")))
                .put("body", new JSONObject().put("water", new JSONObject().put("glasses", drunk)));
        return NotchData.parse(new JSONObject().put("entries", entries).put("planner", planner), null);
    }

    private static NextUp at(NotchData data, String local) {
        return NextUp.of(data, at(local), KOLKATA, false);
    }

    @Test
    public void withinTheHourItCountsDownAndTheRingFillsTowardTheStart() throws Exception {
        NextUp n = at(day(3), "2026-10-18T15:10");
        assertTrue(n.hasTask);
        assertEquals("in 50 min", n.when);
        assertEquals("Group call: merge sections", n.title);
        assertEquals(10 / 60f, n.ring, 0.001f);
        assertEquals("the task's own tone and icon", 2, n.tone);
        assertEquals(R.drawable.sym_groups, n.icon);
        assertEquals(4, n.taskId);
        assertEquals(3, n.glasses);
        assertEquals(8, n.goal);
        assertEquals("it changes when the minute count does", at("2026-10-18T15:11"), n.nextChangeAt);
        assertEquals("in 50 min", at(day(3), "2026-10-18T15:10:59").when);
        assertEquals("in 1 min", at(day(3), "2026-10-18T15:59:30").when);
        assertEquals(at("2026-10-18T16:00"), at(day(3), "2026-10-18T15:59:30").nextChangeAt);
    }

    @Test
    public void furtherAwayItShowsTheClockAndSleepsUntilTheLastHour() throws Exception {
        NextUp n = at(day(0), "2026-10-18T12:00");
        assertEquals("at 4:00 PM", n.when);
        assertEquals(0f, n.ring, 0f);
        assertEquals("no update for three hours", at("2026-10-18T15:00"), n.nextChangeAt);
        assertEquals("at 16:00", NextUp.of(day(0), at("2026-10-18T12:00"), KOLKATA, true).when);
        assertEquals("in 60 min", at(day(0), "2026-10-18T15:00").when);
    }

    @Test
    public void aRunningTaskSaysWhatIsLeftAndFillsByTimeUsed() throws Exception {
        NextUp n = at(day(0), "2026-10-18T16:10");
        assertEquals("Now · 20 min left", n.when);
        assertEquals(10 / 30f, n.ring, 0.001f);
        assertEquals(at("2026-10-18T16:11"), n.nextChangeAt);
        assertEquals("Group call: merge sections, Now, 20 min left. Opens the task.", n.spokenTask());
    }

    @Test
    public void withNothingLeftItSaysSoAndWaitsForMidnight() throws Exception {
        NextUp n = at(day(5), "2026-10-18T21:00");
        assertFalse(n.hasTask);
        assertEquals(NextUp.EMPTY_TITLE, n.title);
        assertEquals("", n.when);
        assertEquals(at("2026-10-19T00:00"), n.nextChangeAt);
        assertEquals(5, n.glasses);
        assertEquals("Water, 5 of 8 glasses. Opens water.", n.spokenWater());
        NextUp blank = at(NotchData.parse(null, null), "2026-10-18T21:00");
        assertEquals("no saved plan still shows the day's goal", 8, blank.goal);
        assertEquals(0, blank.glasses);
    }

    @Test
    public void aCalendarEventIsNeutralAndOpensThePlan() throws Exception {
        JSONArray events = new JSONArray().put(new JSONObject().put("start", at("2026-10-18T17:00")).put("end", at("2026-10-18T18:00"))
                .put("title", "Seminar").put("allDay", false).put("busy", false));
        NextUp n = NextUp.of(NotchData.parse(new JSONObject(), events), at("2026-10-18T16:30"), KOLKATA, false);
        assertTrue(n.event);
        assertEquals(-1, n.tone);
        assertEquals(TaskSymbol.EVENT_ICON, n.icon);
        assertEquals(0, n.taskId);
        assertTrue(n.spokenTask().endsWith("Opens the plan."));
    }

    @Test
    public void theWidgetRefreshesOnEverySaveAndTextSizeChangeAndNeverWakesThePhone() throws Exception {
        String store = new String(Files.readAllBytes(Paths.get("src/main/java/com/rpm/prototype/CompanionStore.java")), StandardCharsets.UTF_8);
        assertTrue(store.contains("f.finishWrite(out);}catch(IOException e){if(out!=null)f.failWrite(out);throw e;}NextUpWidget.changed(c);"));
        String controls = new String(Files.readAllBytes(Paths.get("src/main/java/com/rpm/prototype/CompanionControls.java")), StandardCharsets.UTF_8);
        assertTrue(controls.contains("NextUpWidget.changed(c);message=\"Widget text size set to \""));
        String widget = new String(Files.readAllBytes(Paths.get("src/main/java/com/rpm/prototype/NextUpWidget.java")), StandardCharsets.UTF_8);
        assertFalse("only non-waking alarms", widget.contains("RTC_WAKEUP"));
        assertTrue(widget.contains("CompanionControls.widgetTextScale(c)"));
        assertTrue("two cells on a five-column home screen get the compact row", NextUpWidget.compact(132));
        assertFalse("two cells on a four-column home screen fit the full row", NextUpWidget.compact(170));
        assertFalse("before the launcher reports a size", NextUpWidget.compact(0));
    }

    @Test
    public void widgetLayoutsUseOnlyViewsAHomeScreenCanDraw() throws Exception {
        java.util.Set<String> allowed = new java.util.HashSet<>(java.util.Arrays.asList("FrameLayout", "LinearLayout", "RelativeLayout",
                "GridLayout", "TextView", "ImageView", "Button", "ImageButton", "ProgressBar", "Chronometer", "AnalogClock", "ViewFlipper",
                "ListView", "GridView", "StackView", "AdapterViewFlipper", "ViewStub"));
        java.io.File[] layouts = new java.io.File("src/main/res/layout").listFiles((dir, name) -> name.startsWith("widget"));
        assertTrue(layouts != null && layouts.length >= 3);
        java.util.regex.Pattern tag = java.util.regex.Pattern.compile("<([A-Za-z.]+)[\\s>/]");
        for (java.io.File f : layouts) {
            java.util.regex.Matcher m = tag.matcher(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
            while (m.find()) assertTrue(f.getName() + " uses " + m.group(1) + ", which RemoteViews cannot inflate", allowed.contains(m.group(1)));
        }
    }
}

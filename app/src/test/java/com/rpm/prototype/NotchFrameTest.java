package com.rpm.prototype;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import com.rpm.prototype.NotchFrame.Mode;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Collections;

/** A render that changes nothing on screen yields the same frame key, so the island is not redrawn or relaid out. */
public class NotchFrameTest {
    private static final ZoneId KOLKATA = ZoneId.of("Asia/Kolkata");
    private static final String PLACE = "cutout centre=540,52|1080|1.0";

    private static long at(String local) {
        return LocalDateTime.parse(local).atZone(KOLKATA).toInstant().toEpochMilli();
    }

    private static NotchData day() throws Exception {
        JSONObject task = new JSONObject().put("id", 7).put("title", "Write RM essay").put("raw", "Write RM essay").put("kind", "plan")
                .put("planned", java.time.Instant.ofEpochMilli(at("2026-10-18T15:30")).toString()).put("minutes", 45);
        return NotchData.parse(new JSONObject().put("version", 1).put("entries", new JSONArray().put(task)).put("planner", new JSONObject()), new JSONArray());
    }

    private static NotchFrame frame(NotchData data, String local, Mode mode) {
        NotchScene scene = new NotchScene(data, at(local), Collections.emptyMap(), KOLKATA, false);
        return new NotchFrame(mode, scene, null, null);
    }

    @Test
    public void anUnreadableStoreKeepsWhatTheIslandShowedInsteadOfHidingIt() throws Exception {
        NotchData shown = day();
        NotchData kept = NotchData.readOr(shown, () -> { throw new java.io.IOException("half-written"); }, null);
        assertTrue("the pill stays instead of blinking out", kept == shown);
        assertEquals(1, kept.tasks.size());
        NotchData none = NotchData.readOr(shown, () -> null, null);
        assertTrue("no saved plan yet is a real empty day", none.tasks.isEmpty());
    }

    @Test
    public void sameMomentTwiceGivesTheSameFrame() throws Exception {
        NotchData data = day();
        assertEquals(frame(data, "2026-10-18T15:40:05", Mode.PILL).key(PLACE), frame(data, "2026-10-18T15:40:05", Mode.PILL).key(PLACE));
        assertEquals(frame(data, "2026-10-18T15:40:05", Mode.OPEN).key(PLACE), frame(data, "2026-10-18T15:40:05", Mode.OPEN).key(PLACE));
    }

    @Test
    public void thePillRedrawsOnlyWhenADropChangesNotEachMinute() throws Exception {
        NotchData data = day();
        String first = frame(data, "2026-10-18T15:40:05", Mode.PILL).key(PLACE);
        assertEquals(first, frame(data, "2026-10-18T15:40:31", Mode.PILL).key(PLACE));
        assertEquals("the drops carry no clock", first, frame(data, "2026-10-18T15:41:05", Mode.PILL).key(PLACE));
        assertNotEquals("the next task takes the drop", first, frame(data, "2026-10-18T16:20:00", Mode.PILL).key(PLACE));
        String open = frame(data, "2026-10-18T15:40:05", Mode.OPEN).key(PLACE);
        assertNotEquals("the open island's time still moves", open, frame(data, "2026-10-18T15:41:05", Mode.OPEN).key(PLACE));
    }

    private static NotchData waterDay(int glasses) throws Exception {
        JSONArray drunk = new JSONArray();
        for (int i = 0; i < glasses; i++) drunk.put(java.time.Instant.ofEpochMilli(at("2026-10-18T08:00") + i * 60_000L).toString());
        JSONObject body = new JSONObject().put("water", new JSONObject().put("glasses", drunk));
        JSONObject task = new JSONObject().put("id", 7).put("title", "Call Prof. Rao").put("raw", "Call Prof. Rao").put("kind", "plan")
                .put("planned", java.time.Instant.ofEpochMilli(at("2026-10-18T15:30")).toString()).put("minutes", 45);
        return NotchData.parse(new JSONObject().put("version", 1).put("entries", new JSONArray().put(task))
                .put("planner", new JSONObject().put("body", body)), new JSONArray());
    }

    @Test
    public void eachDropOpensItsOwnIsland() throws Exception {
        NotchFrame both = frame(waterDay(2), "2026-10-18T15:40", Mode.PILL);
        assertTrue(both.taskDrop() && both.habitDrop());
        assertEquals(Mode.OPEN, both.opens(NotchFrame.Side.TASK));
        assertEquals(Mode.HABIT, both.opens(NotchFrame.Side.HABIT));
        assertEquals("the task drop is the task's own tone and icon", R.drawable.sym_call, both.dropIcon());
        assertTrue(both.spoken(NotchFrame.Side.TASK).endsWith("Opens the island."));
        assertEquals("Water due, 2 of 8 glasses. Opens water.", both.spoken(NotchFrame.Side.HABIT));
        NotchFrame taskOnly = frame(day(), "2026-10-18T15:40", Mode.PILL);
        assertFalse(taskOnly.habitDrop());
        assertEquals("a lone drop opens its island from either side", Mode.OPEN, taskOnly.opens(NotchFrame.Side.HABIT));
        NotchFrame waterOnly = frame(waterDay(2), "2026-10-18T21:00", Mode.PILL);
        assertFalse(waterOnly.taskDrop());
        assertEquals(Mode.HABIT, waterOnly.opens(NotchFrame.Side.TASK));
        assertTrue(waterOnly.showsPill());
        NotchFrame nothing = frame(NotchData.parse(new JSONObject(), null), "2026-10-18T21:00", Mode.PILL);
        assertFalse("nothing to show hides the pill", nothing.showsPill());
        assertEquals(Mode.PILL, nothing.opens(NotchFrame.Side.TASK));
    }

    @Test
    public void aLoggedGlassRedrawsTheHabitDropAndItsIsland() throws Exception {
        assertNotEquals(frame(waterDay(2), "2026-10-18T15:40", Mode.PILL).key(PLACE), frame(waterDay(3), "2026-10-18T15:40", Mode.PILL).key(PLACE));
        assertNotEquals(frame(waterDay(2), "2026-10-18T15:40", Mode.HABIT).key(PLACE), frame(waterDay(3), "2026-10-18T15:40", Mode.HABIT).key(PLACE));
        assertEquals(frame(waterDay(2), "2026-10-18T15:40", Mode.HABIT).key(PLACE), frame(waterDay(2), "2026-10-18T15:41", Mode.HABIT).key(PLACE));
    }

    @Test
    public void geometryIsPartOfTheFrame() throws Exception {
        NotchData data = day();
        NotchFrame f = frame(data, "2026-10-18T15:40:05", Mode.PILL);
        assertNotEquals(f.key(PLACE), f.key("cutout centre=540,52|1080|2.0"));
    }

    private static NotchData mealPlan(String snackAt, String name) throws Exception {
        JSONObject snack = new JSONObject().put("slot", "snack").put("at", snackAt).put("on", true).put("name", name);
        JSONObject body = new JSONObject().put("mealPlan", new JSONObject().put("slots", new JSONArray().put(snack)));
        return NotchData.parse(new JSONObject().put("planner", new JSONObject().put("body", body)), null);
    }

    @Test
    public void mealPlanOnlyChangesTheFrameWhenTheVisibleMealChanges() throws Exception {
        String first = frame(mealPlan("16:00", "Tea and fruit"), "2026-10-18T16:30:05", Mode.OPEN).key(PLACE);
        assertEquals(first, frame(mealPlan("16:00", "Tea and fruit"), "2026-10-18T16:30:25", Mode.OPEN).key(PLACE));
        assertEquals(first, frame(mealPlan("15:30", "Tea and fruit"), "2026-10-18T16:30:05", Mode.OPEN).key(PLACE));
        assertNotEquals(first, frame(mealPlan("16:00", "Yogurt"), "2026-10-18T16:30:05", Mode.OPEN).key(PLACE));
        assertNotEquals(first, frame(mealPlan("17:00", "Tea and fruit"), "2026-10-18T16:30:05", Mode.OPEN).key(PLACE));
    }

    private static NotchData busyMealPlan(boolean on, String name, boolean routine) throws Exception {
        JSONObject store = new JSONObject().put("entries", new JSONArray()
                .put(new JSONObject().put("id", 1).put("title", "Essay").put("planned", "2026-10-18T10:00:00Z").put("minutes", 45))
                .put(new JSONObject().put("id", 2).put("title", "Call").put("planned", "2026-10-18T11:00:00Z").put("minutes", 30)));
        JSONObject snack = new JSONObject().put("slot", "snack").put("at", "16:00").put("on", on).put("name", name);
        JSONObject body = new JSONObject().put("mealPlan", new JSONObject().put("slots", new JSONArray().put(snack)));
        if (routine) body.put("routines", new JSONArray().put(new JSONObject().put("id", "r1").put("name", "Tidy")
                .put("start", "16:00").put("end", "17:00").put("days", new JSONArray().put(0))
                .put("steps", new JSONArray().put(new JSONObject().put("id", "s1").put("title", "Desk")))));
        return NotchData.parse(store.put("planner", new JSONObject().put("body", body)), null);
    }

    @Test
    public void renamingTheThirdRowRedrawsTheFrameNowThatThreeRowsShow() throws Exception {
        NotchData first = busyMealPlan(true, "Tea", false);
        NotchScene scene = new NotchScene(first, at("2026-10-18T16:05"), Collections.emptyMap(), KOLKATA, false);
        assertEquals(NotchScene.Look.MEAL, scene.rows.get(2).look);
        assertNotEquals(frame(first, "2026-10-18T16:05", Mode.OPEN).key(PLACE),
                frame(busyMealPlan(true, "Fruit", false), "2026-10-18T16:05", Mode.OPEN).key(PLACE));
    }

    @Test
    public void changingTheMealControlRedrawsEvenWhenNoMealRowFits() throws Exception {
        NotchData first = busyMealPlan(true, "Tea", true);
        NotchScene scene = new NotchScene(first, at("2026-10-18T16:05"), Collections.emptyMap(), KOLKATA, false);
        assertEquals(3, scene.rows.size());
        assertTrue(scene.rows.stream().noneMatch(row -> row.look == NotchScene.Look.MEAL));
        assertEquals("snack", scene.meal);
        assertNotEquals(frame(first, "2026-10-18T16:05", Mode.OPEN).key(PLACE),
                frame(busyMealPlan(false, "Tea", true), "2026-10-18T16:05", Mode.OPEN).key(PLACE));
    }

    @Test
    public void aNoteReplacesThePillValue() throws Exception {
        NotchFrame plain = frame(day(), "2026-10-18T15:40:05", Mode.PILL);
        NotchFrame snoozed = new NotchFrame(Mode.PILL, plain.scene, null, new NotchFrame.Note("+10m", true, "Snoozed 10 minutes"));
        assertEquals("", plain.pillValue());
        assertEquals("+10m", snoozed.pillValue());
        assertTrue(snoozed.chip());
        assertEquals("Snoozed 10 minutes", snoozed.spoken(NotchFrame.Side.HABIT));
        assertNotEquals(plain.key(PLACE), snoozed.key(PLACE));
    }

    @Test
    public void aReminderNeverSaysAlarm() {
        NotchAlert reminder = new NotchAlert(NotchAlert.Type.REMINDER, 7, "Call the bank", at("2026-10-18T11:30"), KOLKATA, false);
        assertFalse(reminder.spoken().toLowerCase().contains("alarm"));
        assertFalse(reminder.spoken().toLowerCase().contains("ringing"));
        assertTrue(reminder.spoken().startsWith("Reminder: Call the bank, 11:30"));
        NotchAlert alarm = new NotchAlert(NotchAlert.Type.ALARM, 7, "Call the bank", at("2026-10-18T11:30"), KOLKATA, false);
        assertEquals("the time is in the band", "Ringing", alarm.ringing());
        assertNotEquals(reminder.key(), alarm.key());
    }

    @Test
    public void reminderNeverSaysAlarm() throws Exception {
        NotchAlert reminder = new NotchAlert(NotchAlert.Type.REMINDER, 7, "Call the bank", at("2026-10-18T17:30"), KOLKATA, false);
        NotchScene scene = new NotchScene(day(), at("2026-10-18T17:30"), Collections.emptyMap(), KOLKATA, false);
        NotchBand band = NotchBand.of(new NotchFrame(Mode.REMINDER, scene, reminder, null), 0);
        assertNotEquals("a reminder shows a bell, never the alarm clock", R.drawable.ic_clock, band.glyph);
        assertEquals(R.drawable.ic_notification, band.glyph);
        assertEquals("its time, without AM/PM", "5:30", band.value);
        assertEquals(NotchBand.Disc.PLAIN, band.disc);
        assertFalse(band.pulse);
        assertFalse((reminder.reminderLine() + reminder.spoken() + band.value).toLowerCase().matches(".*(alarm|ringing).*"));
        NotchAlert alarm = new NotchAlert(NotchAlert.Type.ALARM, 7, "Call the bank", at("2026-10-18T17:30"), KOLKATA, false);
        NotchBand ringing = NotchBand.of(new NotchFrame(Mode.ALARM, scene, alarm, null), 0);
        assertEquals(NotchBand.Disc.ALARM, ringing.disc);
        assertEquals("the band shows the alarm's time; Stop is the primary under the words", "5:30", ringing.value);
        assertTrue(ringing.pulse);
    }

    @Test
    public void bandBesideCameraHoldsRingAndValue() throws Exception {
        NotchFrame open = frame(day(), "2026-10-18T15:40:05", Mode.OPEN);
        NotchBand band = NotchBand.of(open, 0);
        assertEquals(NotchBand.Disc.RING, band.disc);
        assertEquals(R.drawable.notch_ic_task, band.glyph);
        assertEquals("the same value the pill shows", open.scene.pillValue, band.value);
        assertEquals("34m", band.value);
        assertEquals("tinted by kind: the notch's task blue", NotchInk.TASK, band.valueColor);
        assertEquals(10 / 45f, band.progress, 0.01f);
        assertEquals(22f, band.valueSp, 0f);
        assertEquals("the drops carry no band", NotchBand.Disc.NONE, NotchBand.of(frame(day(), "2026-10-18T15:40:05", Mode.PILL), 0).disc);
        assertEquals("nor does the habit island", NotchBand.Disc.NONE, NotchBand.of(frame(waterDay(2), "2026-10-18T15:40:05", Mode.HABIT), 0).disc);
    }

    @Test
    public void sharedRingAndValueTravelOnOpen() {
        float d = 450f / 160f;
        NotchAnchor s24 = NotchAnchor.fromCutout(506, 24, 574, 92, 92, d);
        IslandShape pill = IslandShape.pill(s24, 1080, 150, 150, d);
        IslandShape island = IslandShape.island(s24, 1080, 600, d);
        int drop = NotchGeometry.dropHeight(s24.pillHeight, d);
        NotchGeometry.Band a = NotchGeometry.pill(pill, NotchGeometry.taskDrop(pill, drop, NotchGeometry.taskDropWidth(drop)), d, 15 * d);
        NotchGeometry.Band b = NotchGeometry.island(island, d, 22 * d);
        NotchGeometry.Band start = NotchGeometry.Band.lerp(a, b, 0f);
        NotchGeometry.Band end = NotchGeometry.Band.lerp(a, b, 1f);
        NotchGeometry.Band mid = NotchGeometry.Band.lerp(a, b, 0.5f);
        assertEquals(a.cx, start.cx, 0f);
        assertEquals(b.cx, end.cx, 0f);
        assertEquals(b.diameter, end.diameter, 0f);
        assertEquals("the ring grows from 28dp or less to 40dp", NotchAnchor.dp(40, d), b.diameter, 0f);
        assertTrue(a.diameter < mid.diameter && mid.diameter < b.diameter);
        assertTrue("the value grows from 15sp to 22sp", a.valuePx < mid.valuePx && mid.valuePx < b.valuePx);
        assertTrue("the value moves out from the task drop", mid.valueRight > a.valueRight && mid.valueRight < b.valueRight);
        assertEquals(NotchMotion.OPEN_MS, NotchMotion.of(true).morphMs(true));
    }

    @Test
    public void reducedMotionFadesInsteadOfMoves() {
        NotchMotion moving = NotchMotion.of(true);
        assertEquals(350, moving.morphMs(true));
        assertEquals(300, moving.morphMs(false));
        assertEquals(400, moving.fillMs());
        assertEquals(8, moving.riseDp());
        assertTrue(moving.digitsRoll());
        NotchMotion still = NotchMotion.of(false);
        assertEquals("sizes snap", 0, still.morphMs(true));
        assertEquals("the ring snaps", 0, still.fillMs());
        assertEquals("faces do not rise", 0, still.riseDp());
        assertEquals("faces cross-fade", 150, still.faceInMs());
        assertEquals(150, still.faceOutMs());
        assertEquals(0, still.faceInDelayMs());
        assertFalse("digits cross-fade", still.digitsRoll());
        assertEquals(150, still.valueMs());
        assertFalse(still.pulses());
        for (NotchMotion m : new NotchMotion[]{moving, still}) {
            assertTrue("nothing over 400 ms", m.morphMs(true) <= 400 && m.fillMs() <= 400 && m.faceInDelayMs() + m.faceInMs() <= 400 && m.valueMs() <= 400);
        }
    }

    @Test
    public void rollingDigitsMoveOnlyChangedDigits() {
        assertArrayEquals(new boolean[]{false, true, false}, NotchMotion.changed("45m", "44m"));
        assertArrayEquals(new boolean[]{true, true, false}, NotchMotion.changed("9m", "10m"));
        assertArrayEquals(new boolean[]{true, false}, NotchMotion.changed("10m", "9m"));
        assertArrayEquals(new boolean[]{false, false, false}, NotchMotion.changed("3/8", "3/8"));
        assertArrayEquals(new boolean[]{true, false, false}, NotchMotion.changed("3/8", "4/8"));
        assertArrayEquals(new boolean[]{true, false, true, true}, NotchMotion.changed("4:59", "5:00"));
    }

    @Test
    public void receiptReplacesBandWithRingAndUndo() throws Exception {
        NotchScene scene = new NotchScene(day(), at("2026-10-18T15:40"), Collections.emptyMap(), KOLKATA, false);
        NotchReceipt glass = NotchReceipt.glass(3, 8, 1000);
        NotchBand saving = NotchBand.of(new NotchFrame(Mode.RECEIPT, scene, null, null, null, glass), 0);
        assertEquals("the ring steps from 3 of 8", 3 / 8f, saving.from, 0.001f);
        assertEquals("to 4 of 8", 4 / 8f, saving.progress, 0.001f);
        assertEquals(R.drawable.notch_ic_water, saving.glyph);
        assertEquals(NotchInk.WATER, saving.accent);
        assertEquals("Undo, not a value, takes the trailing slot", "", saving.value);
        NotchBand saved = NotchBand.of(new NotchFrame(Mode.RECEIPT, scene, null, null, null, glass.saved("t", null, 0L)), 0);
        assertEquals("saving then saved keeps one fill, timed from the same start", saving.startedAt, saved.startedAt);
        assertTrue(glass.saved("t", null, 0L).canUndo());
        NotchBand done = NotchBand.of(new NotchFrame(Mode.RECEIPT, scene, null, null, null, NotchReceipt.done("Essay", 5)), 0);
        assertEquals(R.drawable.ic_check, done.glyph);
        assertEquals(1f, done.progress, 0f);
        assertEquals(NotchInk.TASK, done.accent);
        NotchReceipt fromHabit = NotchReceipt.glass(3, 8, 1000, true);
        assertEquals("a glass from the habit island keeps its meter, not the band", NotchBand.Disc.NONE,
                NotchBand.of(new NotchFrame(Mode.RECEIPT, scene, null, null, null, fromHabit.saved("t", null, 0L)), 0).disc);
        assertEquals(3, fromHabit.saved("t", null, 0L).fromCount());
        assertEquals(4, fromHabit.saved("t", null, 0L).toCount());
        assertNotEquals(glass.key(), fromHabit.key());
    }

    @Test
    public void primaryControlsAreFilledWithTheirAccentAndADarkLabel() throws Exception {
        assertEquals(0xFF252C37, NotchInk.onAccent(NotchInk.TASK));
        assertEquals(NotchInk.ALARM_INK, NotchInk.onAccent(NotchInk.ALARM));
        String parts = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/java/com/rpm/prototype/NotchParts.java")), java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(parts.contains("int rest = primary ? accent : NotchInk.SECONDARY;"));
        assertTrue(parts.contains("int ink = primary ? NotchInk.onAccent(accent) : NotchInk.WHITE_70;"));
        assertTrue("dark on the task blue passes 4.5:1", contrast(NotchInk.onAccent(NotchInk.TASK), NotchInk.TASK) >= 4.5);
        assertTrue(contrast(NotchInk.onAccent(NotchInk.WATER), NotchInk.WATER) >= 4.5);
        assertTrue(contrast(NotchInk.ALARM_INK, NotchInk.ALARM) >= 4.5);
        assertEquals(0xFF000000, NotchInk.intoBlack(NotchInk.TASK, 0f));
        assertEquals(NotchInk.TASK, NotchInk.intoBlack(NotchInk.TASK, 1f));
        assertEquals("the notch's task blue passes 3:1 on black", 0xFFA8C7FA, NotchInk.TASK);
    }

    private static double luminance(int c) {
        double[] ch = new double[3];
        for (int i = 0; i < 3; i++) {
            double v = ((c >> (16 - 8 * i)) & 0xFF) / 255.0;
            ch[i] = v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    }

    private static double contrast(int a, int b) {
        double la = luminance(a), lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
}

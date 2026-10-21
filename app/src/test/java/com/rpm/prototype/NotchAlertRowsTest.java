package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import com.rpm.prototype.NotchFrame.Mode;
import com.rpm.prototype.NotchScene.Look;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Collections;

/** Reminders and alarms still to come show in the open island, and its in-place changes show a receipt with Undo. */
public class NotchAlertRowsTest {
    private static final ZoneId KOLKATA = ZoneId.of("Asia/Kolkata");

    private static long at(String local) {
        return LocalDateTime.parse(local).atZone(KOLKATA).toInstant().toEpochMilli();
    }

    private static JSONObject task(long id, String title, String local, int minutes, String alert) throws Exception {
        JSONObject t = new JSONObject().put("id", id).put("title", title).put("raw", title).put("kind", "plan")
                .put("planned", java.time.Instant.ofEpochMilli(at(local)).toString()).put("minutes", minutes);
        if (alert != null) t.put("alertIntent", new JSONObject().put("type", alert));
        return t;
    }

    /** Write RM essay 3:30-4:15, Call Prof. Rao 4:30 (callAlert), Gym 7:00 with a ringing alarm; water due at 4:05. */
    private static NotchData day(String callAlert) throws Exception {
        JSONObject water = new JSONObject().put("settings", new JSONObject().put("goal", 8))
                .put("glasses", new JSONArray().put(java.time.Instant.ofEpochMilli(at("2026-10-18T10:30")).toString()));
        JSONArray entries = new JSONArray()
                .put(task(1, "Write RM essay", "2026-10-18T15:30", 45, null))
                .put(task(2, "Call Prof. Rao", "2026-10-18T16:30", 30, callAlert))
                .put(task(3, "Gym", "2026-10-18T19:00", 60, "alarm"));
        JSONObject planner = new JSONObject().put("body", new JSONObject().put("water", water));
        return NotchData.parse(new JSONObject().put("version", 1).put("entries", entries).put("planner", planner), null);
    }

    private static NotchScene scene(NotchData data, String local) {
        return new NotchScene(data, at(local), Collections.emptyMap(), KOLKATA, false);
    }

    @Test
    public void theNextAlertShowsOnceEvenWhenTheRowsHaveRoomForItTwice() throws Exception {
        JSONArray entries = new JSONArray()
                .put(task(1, "Write RM essay", "2026-10-18T15:30", 45, null))
                .put(task(2, "Call Prof. Rao", "2026-10-18T16:30", 30, null))
                .put(task(3, "Gym", "2026-10-18T19:00", 60, "alarm"));
        NotchData data = NotchData.parse(new JSONObject().put("version", 1).put("entries", entries).put("planner", QuietBody.planner()), null);
        NotchScene s = scene(data, "2026-10-18T16:05");
        assertEquals(3, s.rows.size());
        assertEquals("Gym", s.rows.get(0).title);
        assertEquals("Call Prof. Rao", s.rows.get(1).title);
        assertEquals("Water", s.rows.get(2).title);
        assertEquals(0, s.more(3));
    }

    @Test
    public void theHerosOwnAlertRowNeverPushesDueWaterOutOfTheIsland() throws Exception {
        NotchScene s = scene(day("reminder"), "2026-10-18T16:20");
        assertEquals("reminder", s.heroAlert);
        assertTrue(s.waterDue());
        NotchScene.Row own = s.visibleRows(3).get(0);
        assertTrue(own.heros);
        assertEquals("Reminder", own.title);
        assertEquals("4:30 PM", own.value);
        assertSame(s.hero, own.slot);
        for (int n = 1; n <= 3; n++) {
            boolean glass = s.controls().contains(NotchScene.Control.GLASS);
            for (NotchScene.Row r : s.visibleRows(n)) glass |= r.look == Look.WATER;
            assertTrue("at large text the island shrinks to " + n + " row(s) and still logs a glass", glass);
            assertTrue(s.visibleRows(n).size() <= n);
        }
    }

    @Test
    public void theNextAlertLeadsTheRowsWhenNothingElseShowsItAndDueWaterStaysSecond() throws Exception {
        NotchScene s = scene(day(null), "2026-10-18T16:05");
        NotchScene.Row first = s.rows.get(0);
        assertEquals(Look.ALARM, first.look);
        assertEquals("Gym", first.title);
        assertEquals("7:00 PM", first.value);
        assertEquals("alarm", first.alert);
        assertEquals(3, first.slot.task.id);
        assertEquals("the island shows two small rows, so due water must be one of them", Look.WATER, s.rows.get(1).look);
        assertTrue(s.rows.size() <= 3);
        assertSame(first.slot, s.nextAlert);
    }

    @Test
    public void aTaskRowWhoseAlertIsStillToComeCarriesItsChipInsteadOfASecondRow() throws Exception {
        NotchScene s = scene(day("reminder"), "2026-10-18T16:05");
        NotchScene.Row next = s.rows.get(0);
        assertEquals(Look.TASK, next.look);
        assertEquals("Call Prof. Rao", next.title);
        assertEquals("reminder", next.alert);
        for (NotchScene.Row r : s.rows) assertNotEquals(Look.REMINDER, r.look);
        assertEquals("", s.heroAlert);
    }

    @Test
    public void theHeroShowsItsAlertChipUntilItStarts() throws Exception {
        NotchScene before = scene(day("reminder"), "2026-10-18T16:20");
        assertEquals("Call Prof. Rao", before.heroTitle);
        assertEquals("reminder", before.heroAlert);
        assertEquals("4:30 PM", before.heroAt);
        for (NotchScene.Row r : before.rows) assertFalse("no second row for the hero's own alert", r.slot != null && r.slot.task.id == 2);
        NotchScene during = scene(day("reminder"), "2026-10-18T16:40");
        assertEquals("", during.heroAlert);
        assertEquals("gone off already, so the next alert is the alarm", 3, during.nextAlert.task.id);
    }

    @Test
    public void anAlertChangeRedrawsTheOpenIsland() throws Exception {
        NotchScene reminder = scene(day("reminder"), "2026-10-18T16:20");
        NotchScene alarm = scene(day("alarm"), "2026-10-18T16:20");
        NotchScene off = scene(day("off"), "2026-10-18T16:20");
        assertNotEquals(reminder.key(), alarm.key());
        assertNotEquals(reminder.key(), off.key());
        assertEquals("", off.heroAlert);
    }

    @Test
    public void alertControlsNameTheAlertAsThePlannerDoesAndAReminderNeverSaysAlarm() throws Exception {
        NotchScene s = scene(day("reminder"), "2026-10-18T16:20");
        NotchFrame.Managed reminder = new NotchFrame.Managed(s.hero, s.heroAt);
        assertEquals("Reminder", reminder.line());
        assertEquals("Reminder at 4:30 PM", reminder.spoken());
        assertFalse(reminder.line().toLowerCase().matches(".*(alarm|ringing).*"));
        assertFalse(NotchParts.alertSpoken("reminder", "Call", "4:30 PM").toLowerCase().matches(".*(alarm|ringing).*"));
        NotchFrame.Managed alarm = new NotchFrame.Managed(scene(day("alarm"), "2026-10-18T16:20").hero, "4:30 PM");
        assertEquals("Ringing alarm", alarm.line());
        assertNotEquals(reminder.key(), alarm.key());
        NotchAlert fired = new NotchAlert(NotchAlert.Type.REMINDER, 2, "Call Prof. Rao", at("2026-10-18T16:30"), KOLKATA, false);
        assertEquals("Reminder", fired.reminderLine());
        assertEquals(at("2026-10-18T16:30"), fired.when);
    }

    @Test
    public void undoShowsItsFiveSecondsDrainingFromTheMomentTheChangeIsSaved() throws Exception {
        NotchReceipt saving = NotchReceipt.glass(3, 8, 1000);
        assertEquals("nothing to count while it saves", 0f, saving.undoLeft(1000), 0f);
        NotchReceipt saved = saving.saved("t", null, 2000);
        assertEquals(1f, saved.undoLeft(2000), 0f);
        assertEquals(0.5f, saved.undoLeft(2000 + NotchReceipt.UNDO_MS / 2), 0.001f);
        assertEquals(0f, saved.undoLeft(2000 + NotchReceipt.UNDO_MS), 0f);
        assertEquals(0f, saved.undoLeft(99_000), 0f);
        String views = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/java/com/rpm/prototype/NotchChangeViews.java")), java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(views.contains("NotchParts.pillShape(undo, new UndoCountdown(r, reach, radius),"));
        String countdown = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/java/com/rpm/prototype/UndoCountdown.java")), java.nio.charset.StandardCharsets.UTF_8);
        assertTrue("reads the clock, so it counts down with animations off", countdown.contains("float left = receipt.undoLeft(now);"));
        assertTrue(countdown.contains("scheduleSelf(tick, now + FRAME_MS);"));
    }

    @Test
    public void aReceiptShowsAtOnceAndOffersUndoOnlyOnceSaved() {
        NotchReceipt glass = NotchReceipt.glass(3, 8, 1000);
        assertEquals("Glass logged", glass.title);
        assertEquals("4 of 8 today", glass.detail);
        assertEquals(3 / 8f, glass.from, 0.001);
        assertEquals(4 / 8f, glass.to, 0.001);
        assertFalse(glass.canUndo());
        NotchReceipt saved = glass.saved("event-1", "5 of 8 today", 0L);
        assertTrue(saved.canUndo());
        assertEquals("the saved count wins over the guess", "5 of 8 today", saved.detail);
        assertEquals("the mark keeps playing from the same start", glass.startedAt, saved.startedAt);
        assertFalse(saved.saved(null, null, 0L).canUndo());
        NotchReceipt undoing = saved.undoing(2000);
        assertEquals("Undone", undoing.title);
        assertEquals("Glass removed", undoing.detail);
        assertEquals(saved.to, undoing.from, 0);
        assertFalse(undoing.canUndo());
        NotchReceipt problem = glass.problem("Saved context changed. Reopen RPM before retrying.");
        assertEquals("Not saved", problem.title);
        assertFalse(problem.canUndo());
        assertEquals("Try again.", glass.problem("").detail);
    }

    @Test
    public void receiptWordsFollowThePlannersAlertNames() {
        assertEquals("Alert off", NotchReceipt.alert("off", "Gym", 0).title);
        assertEquals("Reminder set", NotchReceipt.alert("reminder", "Gym", 0).title);
        assertEquals("Ringing alarm set", NotchReceipt.alert("alarm", "Gym", 0).title);
        assertEquals("Done", NotchReceipt.done("Gym", 0).title);
        assertEquals("Gym", NotchReceipt.done("Gym", 0).detail);
    }

    @Test
    public void theReceiptIslandRedrawsOnlyWhenItsWordsOrUndoChange() throws Exception {
        NotchScene s = scene(day(null), "2026-10-18T16:05");
        NotchReceipt saving = NotchReceipt.glass(1, 8, 5);
        String place = "cutout centre=540,52|1080|1.0";
        NotchFrame a = new NotchFrame(Mode.RECEIPT, s, null, null, null, saving);
        NotchFrame b = new NotchFrame(Mode.RECEIPT, s, null, null, null, NotchReceipt.glass(1, 8, 5));
        assertEquals(a.key(place), b.key(place));
        NotchFrame saved = new NotchFrame(Mode.RECEIPT, s, null, null, null, saving.saved("t", null, 0L));
        assertNotEquals(a.key(place), saved.key(place));
    }
}

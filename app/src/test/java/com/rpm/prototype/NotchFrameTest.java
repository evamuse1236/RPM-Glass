package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import com.rpm.prototype.NotchFrame.Mode;
import com.rpm.prototype.PillPriority.Kind;

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
        PillPriority priority = new PillPriority();
        priority.show(Kind.TASK, scene.pillValue, 0);
        return new NotchFrame(mode, priority.primary(0), priority.secondary(0), scene, null, null);
    }

    @Test
    public void sameMomentTwiceGivesTheSameFrame() throws Exception {
        NotchData data = day();
        assertEquals(frame(data, "2026-10-18T15:40:05", Mode.PILL).key(PLACE), frame(data, "2026-10-18T15:40:05", Mode.PILL).key(PLACE));
        assertEquals(frame(data, "2026-10-18T15:40:05", Mode.OPEN).key(PLACE), frame(data, "2026-10-18T15:40:05", Mode.OPEN).key(PLACE));
    }

    @Test
    public void windowEventsWithinTheSameMinuteDoNotChangeThePill() throws Exception {
        NotchData data = day();
        String first = frame(data, "2026-10-18T15:40:05", Mode.PILL).key(PLACE);
        assertEquals(first, frame(data, "2026-10-18T15:40:09", Mode.PILL).key(PLACE));
        assertEquals(first, frame(data, "2026-10-18T15:40:31", Mode.PILL).key(PLACE));
        assertNotEquals(first, frame(data, "2026-10-18T15:41:05", Mode.PILL).key(PLACE));
    }

    @Test
    public void geometryIsPartOfTheFrame() throws Exception {
        NotchData data = day();
        NotchFrame f = frame(data, "2026-10-18T15:40:05", Mode.PILL);
        assertNotEquals(f.key(PLACE), f.key("cutout centre=540,52|1080|2.0"));
    }

    @Test
    public void aNoteReplacesThePillValue() throws Exception {
        NotchFrame plain = frame(day(), "2026-10-18T15:40:05", Mode.PILL);
        NotchFrame snoozed = new NotchFrame(Mode.PILL, plain.primary, null, plain.scene, null, new NotchFrame.Note("+10m", true, "Snoozed 10 minutes"));
        assertEquals("+10m", snoozed.pillValue());
        assertTrue(snoozed.chip());
        assertNotEquals(plain.key(PLACE), snoozed.key(PLACE));
    }

    @Test
    public void aReminderNeverSaysAlarm() {
        NotchAlert reminder = new NotchAlert(NotchAlert.Type.REMINDER, 7, "Call the bank", at("2026-10-18T11:30"), KOLKATA, false);
        assertFalse(reminder.spoken().toLowerCase().contains("alarm"));
        assertFalse(reminder.spoken().toLowerCase().contains("ringing"));
        assertTrue(reminder.spoken().startsWith("Reminder: Call the bank, 11:30"));
        NotchAlert alarm = new NotchAlert(NotchAlert.Type.ALARM, 7, "Call the bank", at("2026-10-18T11:30"), KOLKATA, false);
        assertTrue(alarm.ringing().startsWith("Ringing · 11:30"));
        assertNotEquals(reminder.key(), alarm.key());
    }
}

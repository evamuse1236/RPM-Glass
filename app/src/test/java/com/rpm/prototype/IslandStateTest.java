package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.rpm.prototype.NotchFrame.Mode;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Collections;

public class IslandStateTest {
    private static final ZoneId KOLKATA = ZoneId.of("Asia/Kolkata");

    private static NotchFrame.Managed controls() {
        NotchDay.Task task = new NotchDay.Task(7, "Call Prof. Rao", "", Instant.parse("2026-10-18T11:00:00Z"), 30, "", Collections.emptySet(), false, "reminder");
        return new NotchFrame.Managed(new NotchDay.Slot(task, task.planned.toEpochMilli()), "4:30 PM");
    }

    @Test
    public void lockingSleepingOrTurningThePhoneSidewaysClosesTheIsland() {
        assertFalse(IslandState.showable(true, true, false));
        assertFalse(IslandState.showable(false, false, false));
        assertFalse(IslandState.showable(false, true, true));
        assertTrue(IslandState.showable(false, true, false));

        IslandState open = new IslandState();
        open.expand(true);
        open.hidden();
        assertEquals("unlocking shows the pill, not the island the person left open", Mode.PILL, open.mode(null, null));

        IslandState managing = new IslandState();
        managing.expand(true);
        managing.manage(controls());
        managing.hidden();
        assertNull(managing.managed());
        assertEquals(Mode.PILL, managing.mode(null, null));
    }

    @Test
    public void theControllerClosesTheIslandWheneverThePhoneHidesIt() throws Exception {
        String render = new String(Files.readAllBytes(Paths.get("src/main/java/com/rpm/prototype/NotchController.java")), StandardCharsets.UTF_8);
        int hidden = render.indexOf("if (!showable) state.hidden();");
        assertTrue("render() closes the island when the phone cannot show it", hidden > 0);
        assertTrue("before it picks the face", hidden < render.indexOf("Mode mode = state.mode(alert, receipt);"));
    }

    @Test
    public void alertsThenReceiptsThenWhatThePersonOpened() {
        IslandState s = new IslandState();
        NotchAlert alarm = new NotchAlert(NotchAlert.Type.ALARM, 7, "Gym", 0, KOLKATA, false);
        NotchReceipt receipt = NotchReceipt.done("Gym", 0);
        assertEquals(Mode.PILL, s.mode(null, null));
        s.expand(true);
        assertEquals(Mode.OPEN, s.mode(null, null));
        s.manage(controls());
        assertEquals(Mode.MANAGE, s.mode(null, null));
        assertEquals(Mode.RECEIPT, s.mode(null, receipt));
        assertEquals(Mode.ALARM, s.mode(alarm, receipt));
        s.leaveManaged();
        assertEquals(Mode.OPEN, s.mode(null, null));
        s.close();
        assertEquals(Mode.PILL, s.mode(null, null));
    }
}

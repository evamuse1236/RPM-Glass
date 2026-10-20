package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

public class AlarmHeadsUpTest {
    private static String source(String name) throws Exception {
        return new String(Files.readAllBytes(Paths.get("src/main/java/com/rpm/prototype/" + name + ".java")), StandardCharsets.UTF_8);
    }

    @Test
    public void whileTheNotchShowsTheRingingAlarmItsNotificationStaysInTheShadeWithoutAPopUp() {
        assertEquals(CompanionAlerts.ALARMS_QUIET, AlarmHeadsUp.channel(true));
        assertFalse("no full-screen intent while the notch is the alert", AlarmHeadsUp.fullScreen(true));
        assertEquals("locked, asleep, sideways or the notch off: the alarm rings as before", CompanionAlerts.ALARMS, AlarmHeadsUp.channel(false));
        assertTrue(AlarmHeadsUp.fullScreen(false));

        AlarmHeadsUp.notchCanShow(true);
        assertTrue(AlarmHeadsUp.notchShows());
        AlarmHeadsUp.notchCanShow(false);
        assertFalse(AlarmHeadsUp.notchShows());
    }

    @Test
    public void theNotchReportsWhenItCanShowAnAlarmAndTheServicePostsAccordingly() throws Exception {
        String controller = source("NotchController");
        assertTrue(controller.contains("AlarmHeadsUp.notchCanShow(showable);"));
        assertTrue("off in Settings", controller.matches("(?s).*if \\(!enabled\\(service\\)\\) \\{\\s+AlarmHeadsUp\\.notchCanShow\\(false\\);.*"));
        assertTrue("service unbound", controller.matches("(?s).*void detach\\(\\) \\{\\s+AlarmHeadsUp\\.notchCanShow\\(false\\);.*"));
        String service = source("CompanionAlarmService");
        assertTrue(service.contains("new Notification.Builder(this,AlarmHeadsUp.channel(quiet))"));
        assertTrue(service.contains("if(AlarmHeadsUp.fullScreen(quiet)&&"));
        String alerts = source("CompanionAlerts");
        assertTrue("the quiet channel never pops up", alerts.contains("new NotificationChannel(ALARMS_QUIET,\"RPM alarms shown in the notch\",NotificationManager.IMPORTANCE_LOW)"));
    }
}

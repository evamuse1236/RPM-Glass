package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.ZoneId;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class AlarmHeadsUpTest {
    private static String source(String name) throws Exception {
        return new String(Files.readAllBytes(Paths.get("src/main/java/com/rpm/prototype/" + name + ".java")), StandardCharsets.UTF_8);
    }

    @Test
    public void whileTheNotchShowsTheRingingAlarmItsNotificationStaysInTheShadeWithoutAPopUp() {
        assertEquals(CompanionAlerts.ALARMS_QUIET, AlarmHeadsUp.channel(true));
        assertEquals("locked, asleep, sideways or the notch off: a high-priority notification", CompanionAlerts.ALARMS, AlarmHeadsUp.channel(false));

        AlarmHeadsUp.notchCanShow(true);
        assertTrue(AlarmHeadsUp.notchShows());
        AlarmHeadsUp.notchCanShow(false);
        assertFalse(AlarmHeadsUp.notchShows());
    }

    @Test
    public void noAlarmEverPostsAFullScreenIntent() throws Exception {
        List<Path> offenders;
        try (Stream<Path> files = Files.walk(Paths.get("src/main/java"))) {
            offenders = files.filter(p -> p.toString().endsWith(".java")).filter(p -> {
                try {
                    String s = new String(Files.readAllBytes(p), StandardCharsets.UTF_8);
                    return s.contains("setFullScreenIntent") || s.contains("canUseFullScreenIntent") || s.contains("ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT");
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }).collect(Collectors.toList());
        }
        assertTrue("the notch is the alarm's screen, never a full-screen page: " + offenders, offenders.isEmpty());
        String manifest = new String(Files.readAllBytes(Paths.get("src/main/AndroidManifest.xml")), StandardCharsets.UTF_8);
        assertFalse(manifest.contains("USE_FULL_SCREEN_INTENT"));
    }

    @Test
    public void theNotchReportsWhenItCanShowAnAlarmAndBothServicesPostAccordingly() throws Exception {
        String controller = source("NotchController");
        assertTrue(controller.contains("AlarmHeadsUp.notchCanShow(showable);"));
        assertTrue("off in Settings", controller.matches("(?s).*if \\(!enabled\\(service\\)\\) \\{\\s+AlarmHeadsUp\\.notchCanShow\\(false\\);.*"));
        assertTrue("service unbound", controller.matches("(?s).*void detach\\(\\) \\{\\s+AlarmHeadsUp\\.notchCanShow\\(false\\);.*"));
        String headsUp = source("AlarmHeadsUp");
        assertTrue(headsUp.contains("CompanionAlarmService.repost();"));
        assertTrue("a local alarm re-posts too", headsUp.contains("AlarmService.repost();"));
        assertTrue(source("CompanionAlarmService").contains("new Notification.Builder(this,AlarmHeadsUp.channel(quiet))"));
        assertTrue(source("AlarmService").contains("new Notification.Builder(this,AlarmHeadsUp.channel(AlarmHeadsUp.notchShows()))"));
        String alerts = source("CompanionAlerts");
        assertTrue("the quiet channel never pops up", alerts.contains("new NotificationChannel(ALARMS_QUIET,\"RPM alarms shown in the notch\",NotificationManager.IMPORTANCE_LOW)"));
    }

    @Test
    public void aLocalAlarmRingsInTheNotch() throws Exception {
        String service = source("AlarmService");
        assertTrue("the local service tells the notch when its alarms change",
                service.contains("sendBroadcast(new Intent(CompanionAlarmService.RING_CHANGED).setPackage(getPackageName()))"));
        assertTrue(service.contains("active.put(id,startedAt);changed();"));
        assertTrue(service.contains("private void refreshOrStop(){changed();"));
        String alerting = source("NotchAlerting");
        assertTrue("the notch reads local alarms after planner alarms", alerting.contains("if (local) ids = AlarmService.activeIds();"));
        assertTrue("Stop and Snooze reach the local service",
                alerting.contains("new Intent(service, AlarmService.class).setAction(snooze ? \"SNOOZE\" : \"STOP\")"));
    }

    @Test
    public void aLocalAlarmIsKeptApartFromAPlannerTaskWithTheSameId() {
        NotchAlert planner = new NotchAlert(NotchAlert.Type.ALARM, 7, "Walk", 0, ZoneId.of("UTC"), false);
        NotchAlert local = new NotchAlert(NotchAlert.Type.ALARM, 7, "Walk", 0, ZoneId.of("UTC"), false, true);
        assertFalse(planner.local);
        assertTrue(local.local);
        assertFalse(planner.key().equals(local.key()));
    }
}

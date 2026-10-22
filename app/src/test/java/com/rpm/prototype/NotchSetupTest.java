package com.rpm.prototype;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.junit.Test;

public class NotchSetupTest {
    private static final long NOW = 1_800_000_000_000L;

    private static String source(String name) throws Exception {
        return new String(Files.readAllBytes(Paths.get("src/main/java/com/rpm/prototype/" + name + ".java")), StandardCharsets.UTF_8);
    }

    @Test
    public void aNotchOnInRpmButOffInAndroidSaysSoInTheShade() {
        assertTrue(NotchSetup.shouldPost(true, false, false, 0, NOW));
        assertFalse("a working notch needs no notice", NotchSetup.shouldPost(true, true, false, 0, NOW));
        assertFalse("a notch turned off in RPM needs no notice", NotchSetup.shouldPost(false, false, false, 0, NOW));
    }

    @Test
    public void aDismissedNoticeComesBackAfterSixHoursNotOnEveryOpen() {
        assertFalse("already showing", NotchSetup.shouldPost(true, false, true, 0, NOW));
        assertFalse("posted an hour ago", NotchSetup.shouldPost(true, false, false, NOW - 3_600_000L, NOW));
        assertTrue("posted six hours ago", NotchSetup.shouldPost(true, false, false, NOW - NotchSetup.AGAIN_AFTER_MS, NOW));
    }

    @Test
    public void theCheckRunsAfterAnUpdateABootEachOpenAndWheneverAndroidConnectsOrDropsTheNotch() throws Exception {
        assertTrue("app update and boot", source("ReminderReceiver").contains("NotchSetup.check(c)"));
        String service = source("NotchAccessibilityService");
        int connected = service.indexOf("onServiceConnected");
        int unbind = service.indexOf("onUnbind");
        assertTrue("service connect clears it", service.indexOf("NotchSetup.check(this)", connected) > connected);
        assertTrue("service drop posts it", service.indexOf("NotchSetup.check(this)", unbind) > unbind);
        assertTrue("Capture and the planner opening", source("CompanionActivity").contains("NotchSetup.check(this)"));
        String setup = source("NotchSetup");
        int clear = setup.indexOf("n.cancel(ID);");
        assertTrue("a working notch resets the 6 hours, so a later drop says so at once",
                clear > 0 && setup.indexOf("remove(LAST_POSTED)", clear) > clear
                        && setup.indexOf("remove(LAST_POSTED)", clear) - clear < 80);
        assertTrue("the notice offers App info, where Android hides Allow restricted settings",
                setup.contains("addAction") && setup.contains("ACTION_APPLICATION_DETAILS_SETTINGS"));
        String settings = new String(Files.readAllBytes(Paths.get("../android-companion/settings.mjs")), StandardCharsets.UTF_8);
        assertTrue("RPM's Settings offers the same route", settings.contains("'notch_app_info'")
                && source("CompanionSettingsController").contains("case \"notch_app_info\""));
        assertTrue("the in-app switch", source("CompanionSettingsController").contains("NotchSetup.check(activity)"));
    }
}

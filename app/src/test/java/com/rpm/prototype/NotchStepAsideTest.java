package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.junit.Test;

public class NotchStepAsideTest {
    private static final String SELF = "com.rpm.prototype";
    private static final String SERVICE = "com.rpm.prototype/com.rpm.prototype.NotchAccessibilityService";

    private static String source(String path) throws Exception {
        return new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8);
    }

    @Test
    public void gpayAndPaytmMakeTheNotchStepAside() {
        assertTrue(NotchStepAside.isPaymentApp("com.google.android.apps.nbu.paisa.user"));
        assertTrue(NotchStepAside.isPaymentApp("net.one97.paytm"));
        assertTrue(NotchStepAside.isPaymentApp("com.phonepe.app"));
        assertFalse(NotchStepAside.isPaymentApp("com.whatsapp"));
        assertFalse(NotchStepAside.isPaymentApp(null));
    }

    @Test
    public void theNotchComesBackOnlyWhenAnotherAppIsInFront() {
        assertFalse("still paying", NotchStepAside.shouldReturn("net.one97.paytm", SELF));
        assertFalse("GPay's unlock prompt is System UI", NotchStepAside.shouldReturn("com.android.systemui", SELF));
        assertFalse("nothing known yet", NotchStepAside.shouldReturn(null, SELF));
        assertFalse("RPM itself", NotchStepAside.shouldReturn(SELF, SELF));
        assertTrue("home screen", NotchStepAside.shouldReturn("com.sec.android.app.launcher", SELF));
        assertTrue("another app", NotchStepAside.shouldReturn("com.whatsapp", SELF));
    }

    @Test
    public void turningBackOnKeepsEveryOtherAccessibilityService() {
        assertEquals(SERVICE, NotchStepAside.withService(null, SERVICE));
        assertEquals(SERVICE, NotchStepAside.withService("", SERVICE));
        assertEquals("com.vishw.guard/com.vishw.guard.GuardService:" + SERVICE,
                NotchStepAside.withService("com.vishw.guard/com.vishw.guard.GuardService", SERVICE));
        assertEquals("a:" + SERVICE, NotchStepAside.withService("a:" + SERVICE, SERVICE));
    }

    @Test
    public void theServiceStepsAsideBeforeDrawingForAPaymentApp() throws Exception {
        String service = source("src/main/java/com/rpm/prototype/NotchAccessibilityService.java");
        assertTrue(service.indexOf("isPaymentApp") < service.indexOf("notch::onWindowEvent"));
        assertTrue(service.contains("disableSelf()"));
        assertTrue("events arrive at once, before the payment app's check", source("src/main/res/xml/notch_accessibility.xml").contains("notificationTimeout=\"0\""));
        assertTrue("a paused notch is not reported as broken", source("src/main/java/com/rpm/prototype/NotchSetup.java").contains("NotchStepAside.pausedFor(c) != null"));
    }
}

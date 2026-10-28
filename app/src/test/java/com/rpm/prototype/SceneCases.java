package com.rpm.prototype;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** Builds the old NotchScene for a test and records its inputs, so NotchScenesParityTest can replay every case. */
final class SceneCases {
    record Case(String name, NotchData data, long now, Map<String, Long> snoozes, ZoneId zone, boolean h24) {}

    static final List<Case> SEEN = Collections.synchronizedList(new ArrayList<>());

    private SceneCases() {}

    static NotchScene scene(NotchData data, long now, Map<String, Long> snoozes, ZoneId zone, boolean h24) {
        SEEN.add(new Case(testName(), data, now, Map.copyOf(snoozes), zone, h24));
        return new NotchScene(data, now, snoozes, zone, h24);
    }

    /** The outermost frame of the scene test, which is its @Test method rather than a helper. */
    private static String testName() {
        String name = "?";
        for (StackTraceElement e : Thread.currentThread().getStackTrace()) {
            String cls = e.getClassName();
            if (cls.endsWith("Test") && !cls.endsWith("ParityTest")) name = cls.replaceAll(".*\\.", "") + "." + e.getMethodName();
        }
        return name;
    }
}

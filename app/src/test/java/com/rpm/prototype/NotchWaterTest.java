package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.Test;

public class NotchWaterTest {
    private static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    private static final NotchWater.Settings DEFAULTS = new NotchWater.Settings();

    private static long at(String local) {
        return LocalDateTime.parse("2026-10-18T" + local).atZone(ZONE).toInstant().toEpochMilli();
    }

    private static NotchWater.Status status(List<Long> glasses, List<NotchWater.Busy> busy, long snoozed, String now) {
        return NotchWater.status(glasses, DEFAULTS, busy, snoozed, at(now), ZONE);
    }

    @Test
    public void dueOneIntervalAfterTheLastGlass() {
        List<Long> glasses = Arrays.asList(at("09:00"), at("10:30"));
        NotchWater.Status early = status(glasses, Collections.emptyList(), 0, "11:00");
        assertEquals(2, early.count);
        assertEquals(at("12:00"), early.nextAt);
        assertFalse(early.pending);
        assertTrue(status(glasses, Collections.emptyList(), 0, "12:00").pending);
    }

    @Test
    public void firstNudgeWaitsForTheWindowToOpen() {
        NotchWater.Status s = status(Collections.emptyList(), Collections.emptyList(), 0, "07:00");
        assertEquals(at("08:00"), s.nextAt);
        assertFalse(s.pending);
    }

    @Test
    public void snoozeAndBusyBlocksPushTheNudge() {
        List<Long> glasses = Collections.singletonList(at("09:00"));
        assertFalse(status(glasses, Collections.emptyList(), at("10:45"), "10:40").pending);
        assertEquals(at("10:45"), status(glasses, Collections.emptyList(), at("10:45"), "10:40").nextAt);
        List<NotchWater.Busy> meeting = Collections.singletonList(new NotchWater.Busy(at("10:00"), at("11:00")));
        NotchWater.Status s = status(glasses, meeting, 0, "10:40");
        assertEquals(at("11:00"), s.nextAt);
        assertFalse(s.pending);
    }

    @Test
    public void goalMetOrWindowClosedMeansNoNudge() {
        List<Long> eight = new ArrayList<>();
        for (int i = 0; i < 8; i++) eight.add(at(String.format("%02d:00", 8 + i)));
        assertEquals(0, status(eight, Collections.emptyList(), 0, "17:00").nextAt);
        List<Long> late = Collections.singletonList(at("21:00"));
        assertEquals(0, status(late, Collections.emptyList(), 0, "21:30").nextAt);
    }
}

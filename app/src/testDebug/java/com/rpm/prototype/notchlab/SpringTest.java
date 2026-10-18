package com.rpm.prototype.notchlab;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SpringTest {
    private static final float FRAME = 1f / 60f;

    @Test
    public void islandSpringOvershootsSlightlyThenSettlesWithinHalfASecond() {
        Spring s = Spring.island(0.5f);
        s.snapTo(0f);
        s.target = 100f;
        float peak = 0f;
        float settledAt = -1f;
        for (int frame = 1; frame <= 120; frame++) {
            boolean moving = s.step(FRAME);
            peak = Math.max(peak, s.value);
            if (!moving && settledAt < 0) settledAt = frame * FRAME;
        }
        assertTrue("overshoot " + peak, peak > 102f && peak < 106f);
        assertTrue("settled at " + settledAt, settledAt > 0f && settledAt < 0.5f);
        assertEquals(100f, s.value, 0f);
    }

    @Test
    public void sameCurveAtAnyFrameRate() {
        Spring a = Spring.island(0.01f);
        Spring b = Spring.island(0.01f);
        a.snapTo(0f);
        b.snapTo(0f);
        a.target = 1f;
        b.target = 1f;
        for (int i = 0; i < 6; i++) a.step(1f / 60f);
        for (int i = 0; i < 12; i++) b.step(1f / 120f);
        assertEquals(a.value, b.value, 0.002f);
    }

    @Test
    public void retargetMidFlightKeepsVelocity() {
        Spring s = Spring.island(0.5f);
        s.snapTo(0f);
        s.target = 100f;
        for (int i = 0; i < 5; i++) s.step(FRAME);
        float speed = s.velocity;
        s.target = 0f;
        s.step(1f / 1000f);
        assertTrue(speed > 0f);
        assertTrue("still moving forward right after retarget", s.velocity > 0f);
    }

    @Test
    public void snapToRestsImmediately() {
        Spring s = Spring.island(0.5f);
        s.snapTo(42f);
        assertTrue(s.isAtRest());
        assertFalse(s.step(FRAME));
        assertEquals(42f, s.value, 0f);
    }
}

package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NotchAnchorTest {
    private static final float S24_DENSITY = 450f / 160f;

    @Test
    public void centresOnTheHoleAtTheBottomOfTheCutoutRect() {
        NotchAnchor a = NotchAnchor.fromCutout(479, 0, 601, 132, S24_DENSITY);
        assertTrue(a.fromCutout);
        assertEquals(540, a.centerX);
        assertEquals(122, a.holeDiameter);
        assertEquals(145 / 2, a.centerY);
        assertEquals(0, a.pillTop());
        assertEquals(122 + 23, a.pillHeight);
    }

    @Test
    public void smallHoleGetsTheMinimumPill() {
        NotchAnchor a = NotchAnchor.fromCutout(520, 60, 560, 100, S24_DENSITY);
        assertEquals(101, a.pillHeight);
        assertEquals(540, a.centerX);
        assertEquals(80, a.centerY);
        assertEquals(30, a.pillTop());
    }

    @Test
    public void pillNeverRisesAboveTheScreen() {
        NotchAnchor a = NotchAnchor.fromCutout(520, 0, 560, 40, S24_DENSITY);
        assertEquals(0, a.pillTop());
    }

    @Test
    public void noCutoutFallsBackToTopCentreTwelveDpDown() {
        NotchAnchor a = NotchAnchor.fallback(1080, S24_DENSITY);
        assertFalse(a.fromCutout);
        assertEquals(540, a.centerX);
        assertEquals(34, a.pillTop());
        assertEquals(101, a.pillHeight);
    }
}

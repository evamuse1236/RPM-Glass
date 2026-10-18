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
    public void collapsedPillIsCentredOnThePhoneCamera() {
        NotchAnchor a = NotchAnchor.fromCutout(506, 24, 574, 92, S24_DENSITY);
        int keep = 102, minWidth = NotchAnchor.dp(140, S24_DENSITY);
        for (int[] leadTrail : new int[][] {{110, 130}, {110, 60}, {110, 400}}) {
            int side = NotchAnchor.pillSide(leadTrail[0], leadTrail[1], keep, minWidth);
            int left = a.centerX - keep / 2 - side, right = left + side + keep + side;
            assertEquals("lead " + leadTrail[0] + " trail " + leadTrail[1], a.centerX, (left + right) / 2);
            assertTrue(right - left >= minWidth);
            assertTrue(side >= leadTrail[0] && side >= leadTrail[1]);
        }
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

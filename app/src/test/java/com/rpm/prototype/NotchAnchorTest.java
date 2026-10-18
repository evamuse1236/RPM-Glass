package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NotchAnchorTest {
    private static final float S24_DENSITY = 450f / 160f;
    private static final int S24_STATUS_BAR = 92;

    @Test
    public void measuredS24PillFitsTheStatusBar() {
        NotchAnchor a = NotchAnchor.fromCutout(506, 24, 574, 92, S24_STATUS_BAR, S24_DENSITY);
        assertTrue(a.fromCutout);
        assertEquals(540, a.centerX);
        assertEquals(68, a.holeDiameter);
        assertEquals(24 - Math.round(4 * 2.8125f), a.pillTop());
        assertEquals(92, a.pillBottom());
        assertEquals(92 - 13, a.pillHeight);
    }

    @Test
    public void holeBelowTheStatusBarStaysInsideThePill() {
        NotchAnchor a = NotchAnchor.fromCutout(479, 0, 601, 132, S24_STATUS_BAR, S24_DENSITY);
        assertEquals(122, a.holeDiameter);
        assertEquals(NotchAnchor.dp(2, S24_DENSITY), a.pillTop());
        assertEquals(132, a.pillBottom());
    }

    @Test
    public void unknownStatusBarEndsThePillFourDpBelowTheHole() {
        NotchAnchor a = NotchAnchor.fromCutout(520, 60, 560, 100, 0, S24_DENSITY);
        assertEquals(60 - 11, a.pillTop());
        assertEquals(100 + 11, a.pillBottom());
        assertEquals(80, a.centerY);
    }

    @Test
    public void collapsedPillIsCentredOnThePhoneCamera() {
        NotchAnchor a = NotchAnchor.fromCutout(506, 24, 574, 92, S24_STATUS_BAR, S24_DENSITY);
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
    public void pillStaysTwoDpBelowTheScreenEdge() {
        NotchAnchor a = NotchAnchor.fromCutout(520, 0, 560, 40, S24_STATUS_BAR, S24_DENSITY);
        assertEquals(NotchAnchor.dp(2, S24_DENSITY), a.pillTop());
        assertEquals(S24_STATUS_BAR, a.pillBottom());
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

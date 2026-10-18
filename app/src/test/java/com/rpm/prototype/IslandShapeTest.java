package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The open and alert islands float 12dp in from each side with their top at the pill's top. */
public class IslandShapeTest {
    private static final float D = 450f / 160f;
    private static final NotchAnchor S24 = NotchAnchor.fromCutout(506, 24, 574, 92, 92, D);

    @Test
    public void openIslandFloatsTwelveDpInWithItsTopAtThePillTop() {
        IslandShape open = IslandShape.island(S24, 1080, 700, IslandShape.OPEN_RADIUS_DP, D);
        assertEquals(34f, open.left, 0f);
        assertEquals(1080f - 34f, open.right, 0f);
        assertEquals(S24.pillTop(), open.top, 0f);
        assertEquals(S24.pillTop() + 700f, open.bottom, 0f);
        assertEquals(NotchAnchor.dp(32, D), open.radius, 0f);
        assertEquals(0f, open.splitR, 0f);
    }

    @Test
    public void alertIslandsUseRadiusTwentyEight() {
        IslandShape alert = IslandShape.island(S24, 1080, 300, IslandShape.ALERT_RADIUS_DP, D);
        assertEquals(NotchAnchor.dp(28, D), alert.radius, 0f);
        assertEquals(S24.pillTop(), alert.top, 0f);
    }

    @Test
    public void pillStaysCentredOnTheCameraWithTheSplitCircleToItsLeft() {
        int keep = S24.holeDiameter + NotchAnchor.dp(12, D);
        IslandShape p = IslandShape.pill(S24, 1080, 200, keep, true, D);
        assertEquals(S24.centerX, (p.left + p.right) / 2f, 1f);
        assertEquals(S24.pillHeight / 2f, p.radius, 0f);
        assertTrue(p.splitCx + p.splitR <= p.left - NotchAnchor.dp(8, D) + 1);
        assertTrue("the split circle takes taps too", p.touch.contains(p.splitCx, p.splitCy));
    }

    @Test
    public void windowHoldsTheShadowBelowAFloatingIsland() {
        IslandShape open = IslandShape.island(S24, 1080, 700, IslandShape.OPEN_RADIUS_DP, D);
        Box w = open.window();
        assertTrue(w.bottom >= open.bottom + NotchAnchor.dp(IslandShape.SHADOW_BELOW_DP, D));
        assertTrue(w.left <= open.left - NotchAnchor.dp(IslandShape.SHADOW_SIDE_DP, D));
    }

    @Test
    public void halfwayMorphSitsBetweenBothShapes() {
        int keep = S24.holeDiameter + NotchAnchor.dp(12, D);
        IslandShape p = IslandShape.pill(S24, 1080, 200, keep, false, D);
        IslandShape open = IslandShape.island(S24, 1080, 700, IslandShape.OPEN_RADIUS_DP, D);
        IslandShape mid = IslandShape.lerp(p, open, 0.5f);
        assertEquals((p.left + open.left) / 2f, mid.left, 0.01f);
        assertEquals((p.bottom + open.bottom) / 2f, mid.bottom, 0.01f);
        assertEquals(open.touch, mid.touch);
        Box w = p.window().union(open.window());
        assertTrue(w.left <= mid.window().left && w.right >= mid.window().right && w.bottom >= mid.window().bottom);
    }
}

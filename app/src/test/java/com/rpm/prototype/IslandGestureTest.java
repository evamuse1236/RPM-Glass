package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.rpm.prototype.IslandGesture.Result;

import org.junit.Test;

/** A tap on the pill always opens it; swipes need the playground's distances. */
public class IslandGestureTest {
    private static final float D = 450f / 160f;
    private static final NotchAnchor S24 = NotchAnchor.fromCutout(506, 24, 574, 92, 92, D);

    private static IslandShape pill() {
        int keep = Math.max(NotchAnchor.dp(24, D), S24.holeDiameter + NotchAnchor.dp(12, D));
        int side = NotchAnchor.pillSide(110, 130, keep, NotchAnchor.dp(NotchGeometry.MIN_PILL_WIDTH_DP, D));
        return IslandShape.pill(S24, 1080, side, keep, false, D);
    }

    private static float dp(float v) {
        return v * D;
    }

    @Test
    public void tapInsideThePillIsATap() {
        IslandShape p = pill();
        IslandGesture g = new IslandGesture(D);
        float x = (p.left + p.right) / 2f, y = (p.top + p.bottom) / 2f;
        assertTrue(g.down(p.touch, x, y, 1000));
        assertEquals(Result.TAP, g.up(x, y, 1080));
    }

    @Test
    public void everyPointOfThePillBodyTakesATap() {
        IslandShape p = pill();
        for (float x = p.left; x < p.right; x += 7) {
            for (float y = p.top; y < p.bottom; y += 5) {
                IslandGesture g = new IslandGesture(D);
                assertTrue("down at " + x + "," + y, g.down(p.touch, x, y, 0));
                assertEquals(Result.TAP, g.up(x, y, 60));
            }
        }
    }

    @Test
    public void aShakyFingerIsStillATapAndMayLiftOffThePill() {
        IslandShape p = pill();
        IslandGesture g = new IslandGesture(D);
        float x = p.right - 2, y = p.bottom - 2;
        assertTrue(g.down(p.touch, x, y, 0));
        assertFalse(g.move(x + dp(5), y + dp(4)));
        assertEquals(Result.TAP, g.up(x + dp(5), y + dp(4), 120));
    }

    @Test
    public void tapBesideThePillIsNotTheIsland() {
        IslandShape p = pill();
        IslandGesture g = new IslandGesture(D);
        assertFalse(g.down(p.touch, p.right + dp(4), p.top + 5, 0));
        assertEquals(Result.NONE, g.up(p.right + dp(4), p.top + 5, 50));
    }

    @Test
    public void pillTouchReachesBelowAShortPill() {
        IslandShape p = pill();
        assertTrue(p.touch.bottom >= S24.centerY + NotchAnchor.dp(IslandShape.TOUCH_HEIGHT_DP, D) / 2);
        assertEquals(0, p.touch.top);
    }

    @Test
    public void swipesCommitAtNinetyDpSidewaysAndFortyEightDpUpOrDown() {
        IslandShape p = pill();
        float x = (p.left + p.right) / 2f, y = (p.top + p.bottom) / 2f;
        assertEquals(Result.RIGHT, swipe(p, x, y, x + dp(95), y, 600));
        assertEquals(Result.LEFT, swipe(p, x, y, x - dp(95), y, 600));
        assertEquals(Result.DOWN, swipe(p, x, y, x, y + dp(50), 600));
        assertEquals(Result.UP, swipe(p, x, y, x, y - dp(50), 600));
    }

    @Test
    public void aQuickFlickCommitsEarly() {
        IslandShape p = pill();
        float x = (p.left + p.right) / 2f, y = (p.top + p.bottom) / 2f;
        assertEquals(Result.LEFT, swipe(p, x, y, x - dp(30), y, 40));
        assertEquals(Result.NONE, swipe(p, x, y, x - dp(30), y, 400));
    }

    @Test
    public void longPressFiresOnceAndSwallowsTheLift() {
        IslandShape p = pill();
        IslandGesture g = new IslandGesture(D);
        float x = (p.left + p.right) / 2f, y = (p.top + p.bottom) / 2f;
        g.down(p.touch, x, y, 1000);
        assertFalse(g.longPressAt(1000 + IslandGesture.LONG_PRESS_MS - 1));
        assertTrue(g.longPressAt(1000 + IslandGesture.LONG_PRESS_MS));
        assertFalse(g.longPressAt(1000 + IslandGesture.LONG_PRESS_MS + 100));
        assertEquals(Result.NONE, g.up(x, y, 1700));
    }

    @Test
    public void aSwipeIsNeverALongPress() {
        IslandShape p = pill();
        IslandGesture g = new IslandGesture(D);
        float x = (p.left + p.right) / 2f, y = (p.top + p.bottom) / 2f;
        g.down(p.touch, x, y, 0);
        assertTrue(g.move(x + dp(20), y));
        assertTrue(g.claimed());
        assertFalse(g.longPressAt(900));
    }

    private static Result swipe(IslandShape p, float x0, float y0, float x1, float y1, long ms) {
        IslandGesture g = new IslandGesture(D);
        assertTrue(g.down(p.touch, x0, y0, 0));
        g.move((x0 + x1) / 2f, (y0 + y1) / 2f);
        g.move(x1, y1);
        return g.up(x1, y1, ms);
    }
}

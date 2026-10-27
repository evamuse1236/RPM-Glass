package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.rpm.prototype.IslandGesture.Result;

import org.junit.Test;

/** A tap on a drop always opens its island; swipes need the playground's distances. */
public class IslandGestureTest {
    private static final float D = 450f / 160f;
    private static final NotchAnchor S24 = NotchAnchor.fromCutout(506, 24, 574, 92, 92, D);

    private static IslandShape drops(NotchAnchor a, boolean task, boolean habit) {
        int keep = Math.max(NotchAnchor.dp(24, D), a.holeWidth + NotchAnchor.dp(12, D));
        int drop = NotchGeometry.dropHeight(a.pillHeight, D);
        int taskSide = task ? NotchGeometry.dropSide(keep, NotchGeometry.taskDropWidth(drop), a.pillHeight, drop, D) : 0;
        int habitSide = habit ? NotchGeometry.dropSide(keep, drop, a.pillHeight, drop, D) : 0;
        int[] sides = NotchGeometry.pillSides(taskSide, habitSide, NotchGeometry.bareSide(keep, a.pillHeight));
        return IslandShape.pill(a, 1080, sides[0], sides[1], D);
    }

    private static IslandShape pill() {
        return drops(S24, true, true);
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
    public void aSlowTwentyEightDpSwipeUpFitsInsideThePillPad() {
        IslandShape p = pill();
        IslandGesture g = new IslandGesture(D);
        float x = (p.left + p.right) / 2f;
        float y = p.touch.bottom - dp(2);
        assertTrue(p.touch.contains(x, y - dp(28)));
        assertTrue(g.down(p.touch, x, y, 0, true));
        g.move(x, y - dp(28));
        assertEquals(Result.UP, g.up(x, y - dp(28), 400));
    }

    @Test
    public void aSlowSwipeUpFromThePillsMiddleCommitsBeforeTheScreenTop() {
        IslandShape p = pill();
        IslandGesture g = new IslandGesture(D);
        float x = (p.left + p.right) / 2f;
        float y = (p.touch.top + p.touch.bottom) / 2f;
        float end = y - dp(14);
        assertTrue(end >= 0);
        assertTrue(g.down(p.touch, x, y, 0, true));
        g.move(x, end);
        assertEquals(Result.UP, g.up(x, end, 400));
    }

    @Test
    public void aSwipeWhoseMovesWereDroppedIsStillASwipeNotATap() {
        IslandShape p = pill();
        IslandGesture g = new IslandGesture(D);
        float x = (p.left + p.right) / 2f;
        float y = (p.touch.top + p.touch.bottom) / 2f;
        assertTrue(g.down(p.touch, x, y, 0, false));
        assertEquals(Result.UP, g.up(x, y - dp(140), 150));
    }

    @Test
    public void aPillTapThatDriftsUpBetweenSlopAndThePillsSwipeIsNotLost() {
        for (float drift = IslandGesture.SLOP_DP + 0.5f; drift < IslandGesture.PILL_UP_DP; drift += 0.5f) {
            assertEquals("up " + drift + "dp", Result.TAP, pillDrift(0, -drift, 150));
        }
    }

    @Test
    public void aPillTapThatDriftsDownShortOfASwipeDownStillOpens() {
        for (float drift = IslandGesture.SLOP_DP + 0.5f; drift < IslandGesture.COMMIT_Y_DP; drift += 0.5f) {
            assertEquals("down " + drift + "dp", Result.TAP, pillDrift(0, drift, 400));
        }
        assertEquals(Result.DOWN, pillDrift(0, IslandGesture.COMMIT_Y_DP + 1, 400));
    }

    @Test
    public void aPillTapThatDriftsSidewaysShortOfASwipeStillOpens() {
        for (float drift = IslandGesture.SLOP_DP + 0.5f; drift < IslandGesture.COMMIT_X_DP; drift += 0.5f) {
            assertEquals("right " + drift + "dp", Result.TAP, pillDrift(drift, 0, 600));
            assertEquals("left " + drift + "dp", Result.TAP, pillDrift(-drift, 0, 600));
        }
        assertEquals(Result.RIGHT, pillDrift(IslandGesture.COMMIT_X_DP + 1, 0, 600));
        assertEquals(Result.LEFT, pillDrift(-IslandGesture.COMMIT_X_DP - 1, 0, 600));
    }

    @Test
    public void noPillTouchIsLostExceptALongPresssLift() {
        IslandShape p = pill();
        for (float x0 = p.left; x0 < p.right; x0 += 9) {
            for (float y0 = p.touch.top + 1; y0 < p.touch.bottom; y0 += 9) {
                for (int deg = 0; deg < 360; deg += 15) {
                    for (float dist = 0; dist <= 140; dist += 3) {
                        for (long ms : new long[]{30, 150, 900}) {
                            float x1 = x0 + dp(dist) * (float) Math.cos(Math.toRadians(deg));
                            float y1 = Math.max(0, y0 + dp(dist) * (float) Math.sin(Math.toRadians(deg)));
                            for (boolean moves : new boolean[]{true, false}) {
                                IslandGesture g = new IslandGesture(D);
                                assertTrue(g.down(p.touch, x0, y0, 0, true));
                                if (moves) g.move(x1, y1);
                                Result r = g.up(x1, y1, ms);
                                assertTrue(deg + "deg " + dist + "dp in " + ms + "ms gave NONE", r != Result.NONE);
                            }
                        }
                    }
                }
            }
        }
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

    private static Result pillDrift(float dxDp, float dyDp, long ms) {
        IslandShape p = pill();
        float x = (p.left + p.right) / 2f;
        float y = (p.touch.top + p.touch.bottom) / 2f;
        IslandGesture g = new IslandGesture(D);
        assertTrue(g.down(p.touch, x, y, 0, true));
        g.move(x + dp(dxDp), y + dp(dyDp));
        return g.up(x + dp(dxDp), y + dp(dyDp), ms);
    }

    private static Result swipe(IslandShape p, float x0, float y0, float x1, float y1, long ms) {
        IslandGesture g = new IslandGesture(D);
        assertTrue(g.down(p.touch, x0, y0, 0));
        g.move((x0 + x1) / 2f, (y0 + y1) / 2f);
        g.move(x1, y1);
        return g.up(x1, y1, ms);
    }
}

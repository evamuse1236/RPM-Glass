package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The overlay is relaid out only when what it draws changes size; the same frame twice costs nothing. */
public class IslandWindowTest {
    private static final float D = 450f / 160f;
    private static final NotchAnchor S24 = NotchAnchor.fromCutout(506, 24, 574, 92, 92, D);

    private static IslandShape pill(int side) {
        int keep = S24.holeDiameter + NotchAnchor.dp(12, D);
        return IslandShape.pill(S24, 1080, side, keep, false, D);
    }

    @Test
    public void sameFrameTwiceIsNotRedrawnOrRelaidOut() {
        IslandWindow w = new IslandWindow();
        Box target = pill(160).window();
        assertFalse(w.showing("pill|TASK|25m"));
        assertEquals(target, w.begin("pill|TASK|25m", target, target, false));
        assertNull(w.settle(target));
        assertTrue(w.showing("pill|TASK|25m"));
    }

    @Test
    public void newTextOfTheSameWidthRedrawsWithoutResizing() {
        IslandWindow w = new IslandWindow();
        Box target = pill(160).window();
        w.begin("pill|TASK|25m", target, target, true);
        assertFalse(w.showing("pill|TASK|24m"));
        assertNull(w.begin("pill|TASK|24m", target, target, true));
        assertNull(w.settle(target));
    }

    @Test
    public void morphHoldsBothShapesThenShrinksOnceSettled() {
        IslandWindow w = new IslandWindow();
        IslandShape pill = pill(160);
        IslandShape open = IslandShape.island(S24, 1080, 900, IslandShape.OPEN_RADIUS_DP, D);
        w.begin("pill", pill.window(), pill.window(), true);
        Box during = w.begin("open", open.window(), pill.window(), true);
        assertEquals(open.window().union(pill.window()), during);
        assertEquals(open.window(), during);
        Box back = w.begin("pill", pill.window(), open.window(), true);
        assertNull("still big enough for both", back);
        assertEquals(pill.window(), w.settle(pill.window()));
        assertNull(w.settle(pill.window()));
    }

    @Test
    public void withAnimationsOffTheWindowJumpsStraightToTheTarget() {
        IslandWindow w = new IslandWindow();
        IslandShape pill = pill(160);
        IslandShape open = IslandShape.island(S24, 1080, 900, IslandShape.OPEN_RADIUS_DP, D);
        w.begin("open", open.window(), open.window(), false);
        assertEquals(pill.window(), w.begin("pill", pill.window(), open.window(), false));
        assertNull(w.settle(pill.window()));
    }

    @Test
    public void theDrawingWindowNeverMovesOnlyItsHeightChanges() {
        IslandWindow w = new IslandWindow();
        IslandShape pill = pill(160);
        IslandShape open = IslandShape.island(S24, 1080, 900, IslandShape.OPEN_RADIUS_DP, D);
        Box first = w.begin("pill", IslandWindow.stage(pill.window(), 1080), IslandWindow.stage(pill.window(), 1080), true);
        Box opening = w.begin("open", IslandWindow.stage(open.window(), 1080), IslandWindow.stage(pill.window(), 1080), true);
        Box closed = w.settle(IslandWindow.stage(pill.window(), 1080));
        for (Box b : new Box[] {first, opening, closed}) {
            assertEquals("left edge stays put", 0, b.left);
            assertEquals("top edge stays put", 0, b.top);
            assertEquals("full width, so a morph never moves the window", 1080, b.right);
        }
        assertEquals(open.window().bottom, opening.bottom);
        assertEquals(pill.window().bottom, closed.bottom);
    }

    @Test
    public void afterTheWindowIsRemovedTheNextFrameIsDrawn() {
        IslandWindow w = new IslandWindow();
        Box target = pill(160).window();
        w.begin("pill", target, target, false);
        w.forget();
        assertFalse(w.showing("pill"));
        assertEquals(target, w.begin("pill", target, target, false));
    }
}

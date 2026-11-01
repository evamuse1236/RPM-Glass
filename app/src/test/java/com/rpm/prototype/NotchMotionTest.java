package com.rpm.prototype;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NotchMotionTest {
    @Test
    public void reducedMotionFadesInsteadOfMoves() {
        NotchMotion moving = NotchMotion.of(true);
        assertEquals(350, moving.morphMs(true));
        assertEquals(300, moving.morphMs(false));
        assertEquals(400, moving.fillMs());
        assertEquals(8, moving.riseDp());
        assertTrue(moving.digitsRoll());
        NotchMotion still = NotchMotion.of(false);
        assertEquals("sizes snap", 0, still.morphMs(true));
        assertEquals("the ring snaps", 0, still.fillMs());
        assertEquals("faces do not rise", 0, still.riseDp());
        assertEquals("faces cross-fade", 150, still.faceInMs());
        assertEquals("the old face goes at once", 0, still.faceOutMs());
        assertEquals(0, still.faceInDelayMs());
        assertFalse("digits cross-fade", still.digitsRoll());
        assertEquals(150, still.valueMs());
        assertFalse(still.pulses());
        for (NotchMotion m : new NotchMotion[]{moving, still}) {
            assertTrue("nothing over 400 ms", m.morphMs(true) <= 400 && m.fillMs() <= 400 && m.faceInDelayMs() + m.faceInMs() <= 400 && m.valueMs() <= 400);
        }
    }

    @Test
    public void rowsAndDigitsStepInTurnOnlyWhenMotionIsOn() {
        NotchMotion moving = NotchMotion.of(true);
        int[] rows = {0, 30, 60, 90, 90, 90};
        for (int i = 0; i < rows.length; i++) assertEquals("row " + i, rows[i], moving.rowDelayMs(i));
        int[] places = {0, 40, 80, 80};
        for (int i = 0; i < places.length; i++) assertEquals("place " + i, places[i], moving.rollDelayMs(i));
        assertEquals("250 ms roll plus the 80 ms stagger", 330, moving.valueMs());
        assertTrue("the last row lands inside 400 ms", moving.faceInDelayMs() + moving.rowDelayMs(9) + moving.faceInMs() <= 400);
        NotchMotion still = NotchMotion.of(false);
        for (int i = 0; i < 6; i++) {
            assertEquals("Reduce Motion: no row stagger", 0, still.rowDelayMs(i));
            assertEquals("Reduce Motion: no digit stagger", 0, still.rollDelayMs(i));
        }
    }

    @Test
    public void rollingDigitsMoveOnlyChangedDigits() {
        assertArrayEquals(new boolean[]{false, true, false}, NotchMotion.changed("45m", "44m"));
        assertArrayEquals(new boolean[]{true, true, false}, NotchMotion.changed("9m", "10m"));
        assertArrayEquals(new boolean[]{true, false}, NotchMotion.changed("10m", "9m"));
        assertArrayEquals(new boolean[]{false, false, false}, NotchMotion.changed("3/8", "3/8"));
        assertArrayEquals(new boolean[]{true, false, false}, NotchMotion.changed("3/8", "4/8"));
        assertArrayEquals(new boolean[]{true, false, true, true}, NotchMotion.changed("4:59", "5:00"));
    }
}

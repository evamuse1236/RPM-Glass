package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import com.rpm.prototype.PillPriority.Kind;

import org.junit.Before;
import org.junit.Test;

public class PillPriorityTest {
    private PillPriority pill;

    @Before
    public void setUp() {
        pill = new PillPriority();
        pill.show(Kind.TASK, "25m", 0);
    }

    @Test
    public void taskShowsWhenNothingElseIsLive() {
        assertEquals(Kind.TASK, pill.primary(1_000).kind);
        assertNull(pill.secondary(1_000));
        assertEquals(Long.MAX_VALUE, pill.nextChangeAt(1_000));
    }

    @Test
    public void waterLeadsForEightSecondsThenSitsBesideTheTask() {
        pill.show(Kind.WATER, "5/8", 10_000);
        assertEquals(Kind.WATER, pill.primary(10_000).kind);
        assertEquals(Kind.TASK, pill.secondary(10_000).kind);
        assertEquals(Kind.WATER, pill.primary(17_999).kind);
        assertEquals(18_000, pill.nextChangeAt(10_000));
        assertEquals(Kind.TASK, pill.primary(18_000).kind);
        assertEquals(Kind.WATER, pill.secondary(18_000).kind);
        assertEquals(Long.MAX_VALUE, pill.nextChangeAt(18_000));
    }

    @Test
    public void aRefreshKeepsTheNudgeClock() {
        pill.show(Kind.WATER, "5/8", 0);
        pill.show(Kind.WATER, "5/8", 60_000);
        assertEquals(Kind.TASK, pill.primary(60_000).kind);
        pill.show(Kind.TASK, "24m", 60_000);
        assertEquals("24m", pill.primary(60_000).text);
    }

    @Test
    public void waterAloneLeadsAfterItsEmphasis() {
        pill.dismiss(Kind.TASK);
        pill.show(Kind.WATER, "5/8", 0);
        assertEquals(Kind.WATER, pill.primary(20_000).kind);
        assertNull(pill.secondary(20_000));
    }

    @Test
    public void dismissedWaterLeavesTheTask() {
        pill.show(Kind.WATER, "5/8", 0);
        pill.dismiss(Kind.WATER);
        assertEquals(Kind.TASK, pill.primary(1).kind);
        assertNull(pill.secondary(1));
    }

    @Test
    public void emptyPillShowsNothing() {
        pill.dismiss(Kind.TASK);
        assertNull(pill.primary(0));
        assertNull(pill.secondary(0));
    }
}

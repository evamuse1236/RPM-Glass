package com.rpm.prototype.notchlab;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import com.rpm.prototype.notchlab.PillPriority.Kind;

import org.junit.Before;
import org.junit.Test;

public class PillPriorityTest {
    private PillPriority pill;

    @Before
    public void setUp() {
        pill = new PillPriority();
        pill.post(Kind.TASK, "Write RM essay", 0);
    }

    @Test
    public void taskShowsWhenNothingElseIsLive() {
        assertEquals(Kind.TASK, pill.primary(1_000).kind);
        assertNull(pill.secondary(1_000));
        assertEquals(Long.MAX_VALUE, pill.nextChangeAt(1_000));
    }

    @Test
    public void waterShowsForEightSecondsThenTheTaskReturns() {
        pill.post(Kind.WATER, "5/8", 10_000);
        assertEquals(Kind.WATER, pill.primary(10_000).kind);
        assertEquals(Kind.TASK, pill.secondary(10_000).kind);
        assertEquals(Kind.WATER, pill.primary(17_999).kind);
        assertEquals(18_000, pill.nextChangeAt(10_000));
        assertEquals(Kind.TASK, pill.primary(18_000).kind);
    }

    @Test
    public void higherKindsWinInOrder() {
        pill.post(Kind.AGENT, "Moved Gym to 7 PM", 0);
        pill.post(Kind.WATER, "5/8", 0);
        pill.post(Kind.MEAL, "Lunch?", 0);
        assertEquals(Kind.AGENT, pill.primary(1).kind);
        assertEquals(Kind.MEAL, pill.secondary(1).kind);
        assertEquals(Kind.MEAL, pill.primary(4_000).kind);
        assertEquals(Kind.WATER, pill.secondary(4_000).kind);
        assertEquals(Kind.MEAL, pill.primary(8_000).kind);
        assertEquals(Kind.TASK, pill.secondary(8_000).kind);
        assertEquals(Kind.TASK, pill.primary(12_000).kind);
    }

    @Test
    public void newestAgentMessageWinsAndRestartsItsTime() {
        pill.post(Kind.AGENT, "Moved Gym to 7 PM", 0);
        pill.post(Kind.AGENT, "Added Call Rao at 4 PM", 3_000);
        assertEquals("Added Call Rao at 4 PM", pill.primary(3_500).text);
        assertEquals(Kind.AGENT, pill.primary(6_999).kind);
        assertEquals(Kind.TASK, pill.primary(7_000).kind);
    }

    @Test
    public void aHiddenNudgeKeepsItsOwnClock() {
        pill.post(Kind.WATER, "5/8", 0);
        pill.post(Kind.AGENT, "Moved Gym to 7 PM", 6_000);
        assertEquals(Kind.AGENT, pill.primary(9_000).kind);
        assertEquals(Kind.TASK, pill.secondary(9_000).kind);
        assertEquals(10_000, pill.nextChangeAt(9_000));
    }

    @Test
    public void dismissAndClearRemoveNudgesButKeepTheTask() {
        pill.post(Kind.WATER, "5/8", 0);
        pill.dismiss(Kind.WATER);
        assertEquals(Kind.TASK, pill.primary(1).kind);
        pill.post(Kind.MEAL, "Lunch?", 0);
        pill.post(Kind.AGENT, "Moved Gym", 0);
        pill.clearNudges();
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

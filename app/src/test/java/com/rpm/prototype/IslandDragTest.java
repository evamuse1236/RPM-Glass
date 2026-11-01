package com.rpm.prototype;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class IslandDragTest {
    private static final float D = 450f / 160f;

    @Test
    public void aFlickHandsItsSpeedToTheSpringCappedAt600dpPerSecond() {
        assertEquals(300f * D, IslandDrag.releaseVelocity(300f * D, 16, D), 0.01f);
        assertEquals(600f * D, IslandDrag.releaseVelocity(5000f * D, 16, D), 0.01f);
        assertEquals(-600f * D, IslandDrag.releaseVelocity(-5000f * D, 16, D), 0.01f);
    }

    @Test
    public void aFingerThatRestedBeforeLiftingHandsNoSpeed() {
        assertEquals(300f * D, IslandDrag.releaseVelocity(300f * D, 100, D), 0.01f);
        assertEquals(0f, IslandDrag.releaseVelocity(300f * D, 101, D), 0f);
    }

    @Test
    public void theIslandFollowsTheFingerThenSpringsHomeAtItsLastSpeed() {
        IslandDrag drag = new IslandDrag(D);
        drag.down();
        drag.follow(-4f * D, 1000);
        drag.follow(-8f * D, 1016);
        assertEquals(-8f * D, drag.spring.value, 0f);
        assertEquals(0f, drag.spring.velocity, 0f);
        assertTrue(drag.letGo(1020));
        assertEquals(0f, drag.spring.target, 0f);
        assertEquals(-4f * D * 1000f / 16f, drag.spring.velocity, 0.01f);
    }

    @Test
    public void lettingGoAtHomeDoesNothing() {
        IslandDrag drag = new IslandDrag(D);
        drag.down();
        assertFalse(drag.letGo(1000));
        assertEquals(0f, drag.spring.velocity, 0f);
    }
}

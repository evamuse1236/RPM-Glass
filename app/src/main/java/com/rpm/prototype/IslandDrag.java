package com.rpm.prototype;

/** The island's vertical drag: it follows the finger, keeps the finger's speed, and springs home at that speed. */
final class IslandDrag {
    /** The fastest the island leaves the finger, in dp per second; a harder flick does not throw it further. */
    static final float MAX_RELEASE_DP_PER_S = 600f;
    /** A finger that rested this long before lifting lets the island go from rest. */
    static final long STILL_MS = 100;

    final Spring spring = Spring.island(0.5f);
    private final float density;
    private long movedAt;
    private float speed;

    IslandDrag(float density) {
        this.density = density;
        spring.snapTo(0f);
    }

    void down() {
        movedAt = 0;
        speed = 0f;
    }

    /** Puts the island where the finger pulled it and keeps this move's speed. */
    void follow(float y, long at) {
        if (movedAt > 0 && at > movedAt) speed = (y - spring.value) * 1000f / (at - movedAt);
        movedAt = at;
        spring.value = y;
        spring.target = y;
        spring.velocity = 0f;
    }

    /** Sends the island home at the finger's last speed; false when it is already home. */
    boolean letGo(long at) {
        if (spring.value == 0f && spring.target == 0f) return false;
        spring.target = 0f;
        spring.velocity = releaseVelocity(speed, at - movedAt, density);
        return true;
    }

    /** The speed the island keeps when the finger lifts: the last move's speed, capped, or none after a rest. */
    static float releaseVelocity(float speed, long sinceMoveMs, float density) {
        if (sinceMoveMs > STILL_MS) return 0f;
        float max = MAX_RELEASE_DP_PER_S * density;
        return Math.max(-max, Math.min(max, speed));
    }
}

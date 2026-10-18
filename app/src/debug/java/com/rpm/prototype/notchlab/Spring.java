package com.rpm.prototype.notchlab;

/** A damped spring with unit mass, stepped in fixed slices so any frame rate gives the same curve. */
final class Spring {
    static final float DAMPING = 0.72f;
    static final float STIFFNESS = 520f;
    private static final float SLICE_SECONDS = 1f / 1000f;

    private final float stiffness;
    private final float damping;
    private final float restDistance;
    float value;
    float velocity;
    float target;

    Spring(float dampingRatio, float stiffness, float restDistance) {
        this.stiffness = stiffness;
        this.damping = 2f * dampingRatio * (float) Math.sqrt(stiffness);
        this.restDistance = restDistance;
    }

    static Spring island(float restDistance) {
        return new Spring(DAMPING, STIFFNESS, restDistance);
    }

    void snapTo(float to) {
        value = to;
        target = to;
        velocity = 0f;
    }

    /** Returns true while the spring still moves. */
    boolean step(float seconds) {
        if (isAtRest()) {
            value = target;
            velocity = 0f;
            return false;
        }
        for (float left = seconds; left > 0f; left -= SLICE_SECONDS) {
            float dt = Math.min(SLICE_SECONDS, left);
            float accel = -stiffness * (value - target) - damping * velocity;
            velocity += accel * dt;
            value += velocity * dt;
        }
        return true;
    }

    boolean isAtRest() {
        return Math.abs(value - target) < restDistance && Math.abs(velocity) < restDistance * 10f;
    }
}

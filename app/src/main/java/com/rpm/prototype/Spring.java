package com.rpm.prototype;

import android.animation.TimeInterpolator;

/** A damped spring with unit mass, stepped in fixed slices so any frame rate gives the same curve. */
final class Spring {
    static final float DAMPING = 0.72f;
    /** Closing damping: the same speed, but the island cannot pass its target, so it never shows the camera hole. */
    static final float CLOSE_DAMPING = 1f;
    static final float STIFFNESS = 520f;
    /** No island morph passes its target by more than this share of the change (the spring's own peak is 3.8%). */
    static final float OVERSHOOT_BOUND = 0.05f;
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

    /** Where a spring released from 0 toward 1 is after {@code seconds}: the closed-form step response. */
    static float response(float dampingRatio, float stiffness, float seconds) {
        double w = Math.sqrt(stiffness), decay = Math.exp(-dampingRatio * w * seconds);
        if (dampingRatio >= 1f) return (float) (1 - decay * (1 + w * seconds));
        double wd = w * Math.sqrt(1 - dampingRatio * dampingRatio);
        return (float) (1 - decay * (Math.cos(wd * seconds) + dampingRatio * w / wd * Math.sin(wd * seconds)));
    }

    /**
     * The island spring's step response played over a fixed duration, for a ValueAnimator. The tail left at the end is
     * spread linearly over the whole run, so the curve starts at 0 and ends exactly at 1; an underdamped one passes 1
     * on the way.
     */
    static final class Curve implements TimeInterpolator {
        final long ms;
        private final float dampingRatio;
        private final float seconds;
        private final float tail;

        Curve(float dampingRatio, long ms) {
            this.ms = ms;
            this.dampingRatio = dampingRatio;
            this.seconds = Math.max(1, ms) / 1000f;
            this.tail = 1f - response(dampingRatio, STIFFNESS, seconds);
        }

        @Override
        public float getInterpolation(float f) {
            return response(dampingRatio, STIFFNESS, f * seconds) + f * tail;
        }
    }
}

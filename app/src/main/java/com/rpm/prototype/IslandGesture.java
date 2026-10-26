package com.rpm.prototype;

/**
 * Reads one touch on the island as a tap, a long press or a swipe, with the thresholds of playground/notch-gesture.mjs.
 * A touch that starts on the island and stays within the slop is always a tap, wherever it lifts.
 */
final class IslandGesture {
    enum Result { NONE, TAP, LONG_PRESS, LEFT, RIGHT, UP, DOWN }
    enum PillAction { NONE, OPEN, LATER, HOLD }

    static PillAction pillAction(Result result) {
        switch (result) {
            case TAP:
            case DOWN: return PillAction.OPEN;
            case UP:
            case RIGHT:
            case LEFT: return PillAction.LATER;
            case LONG_PRESS: return PillAction.HOLD;
            default: return PillAction.NONE;
        }
    }

    static final float SLOP_DP = 8;
    static final float COMMIT_X_DP = 90;
    static final float COMMIT_Y_DP = 48;
    static final float PILL_UP_DP = 24;
    static final float FLICK_DP = 24;
    static final float FLICK_DP_PER_MS = 0.5f;
    static final long LONG_PRESS_MS = 500;

    private final float density;
    private boolean active;
    private boolean longPressed;
    private boolean pill;
    private Boolean horizontal;
    private float startX;
    private float startY;
    private long startAt;

    IslandGesture(float density) {
        this.density = density;
    }

    /** Starts a touch. False when it lands outside {@code touch}: the island does not own it. */
    boolean down(Box touch, float x, float y, long at) {
        return down(touch, x, y, at, false);
    }

    boolean down(Box touch, float x, float y, long at, boolean pill) {
        this.pill = pill;
        active = touch.contains(x, y);
        longPressed = false;
        horizontal = null;
        startX = x;
        startY = y;
        startAt = at;
        return active;
    }

    /** True once the finger has left the slop, so the island takes the touch from the button under it. */
    boolean move(float x, float y) {
        if (!active) return false;
        if (horizontal == null && Math.hypot(x - startX, y - startY) >= SLOP_DP * density) {
            horizontal = Math.abs(x - startX) > Math.abs(y - startY);
        }
        return horizontal != null;
    }

    /** True when the finger has rested {@link #LONG_PRESS_MS} without moving. Reports once. */
    boolean longPressAt(long at) {
        if (!active || longPressed || horizontal != null || at - startAt < LONG_PRESS_MS) return false;
        longPressed = true;
        return true;
    }

    Result up(float x, float y, long at) {
        if (!active) return Result.NONE;
        active = false;
        if (longPressed) return Result.NONE;
        move(x, y);
        if (horizontal == null) return Result.TAP;
        float d = horizontal ? x - startX : y - startY;
        float speed = Math.abs(d) / Math.max(1, at - startAt);
        float commit = (horizontal ? COMMIT_X_DP : pill && d < 0 ? PILL_UP_DP : COMMIT_Y_DP) * density;
        boolean far = Math.abs(d) >= commit || (Math.abs(d) >= FLICK_DP * density && speed >= FLICK_DP_PER_MS * density);
        if (!far) return Result.NONE;
        if (horizontal) return d > 0 ? Result.RIGHT : Result.LEFT;
        return d > 0 ? Result.DOWN : Result.UP;
    }

    void cancel() {
        active = false;
    }

    boolean isActive() {
        return active;
    }

    /** Whether the touch has become a swipe or a long press, so buttons under it must not fire. */
    boolean claimed() {
        return horizontal != null || longPressed;
    }
}

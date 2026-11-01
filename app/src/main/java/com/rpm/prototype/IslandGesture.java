package com.rpm.prototype;

/**
 * Reads one touch on the island as a tap, a long press or a swipe, with the thresholds of playground/notch-gesture.mjs.
 * A touch that starts on the island and stays within the slop is always a tap, wherever it lifts.
 * On the collapsed pill a touch that is not a swipe or a long press is a tap, so no pill touch is lost.
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
    static final float PILL_UP_DP = 12;
    /** An open island closes on a short swipe up: it sits at the screen's top, so a thumb has little room above it. */
    static final float ISLAND_UP_DP = 24;
    /**
     * While dragged upward the island starts to follow the finger at this share of its travel and stiffens toward
     * {@link #MAX_FOLLOW_DP}; downward it gives a third as much.
     */
    static final float FOLLOW = 0.35f;
    static final float MAX_FOLLOW_DP = 28;
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
        move(x, y);
        active = false;
        if (longPressed) return Result.NONE;
        move(x, y);
        if (horizontal == null) return Result.TAP;
        float d = horizontal ? x - startX : y - startY;
        float speed = Math.abs(d) / Math.max(1, at - startAt);
        float commit = (horizontal ? COMMIT_X_DP : d < 0 ? (pill ? PILL_UP_DP : ISLAND_UP_DP) : COMMIT_Y_DP) * density;
        boolean far = Math.abs(d) >= commit || (Math.abs(d) >= FLICK_DP * density && speed >= FLICK_DP_PER_MS * density);
        if (!far) return pill ? Result.TAP : Result.NONE;
        if (horizontal) return d > 0 ? Result.RIGHT : Result.LEFT;
        return d > 0 ? Result.DOWN : Result.UP;
    }

    /**
     * How far the island is drawn from its place while the finger drags it: a rubber band that gives freely at first
     * and stiffens toward {@link #MAX_FOLLOW_DP}, fuller upward (where a swipe closes it) than downward. Zero for a
     * tap, a sideways drag or the pill.
     */
    float pull(float y) {
        if (!dragging()) return 0f;
        float d = y - startY;
        return Math.signum(d) * rubber(Math.abs(d), d < 0 ? FOLLOW : FOLLOW / 3f, MAX_FOLLOW_DP * density);
    }

    /** iOS's rubber band: {@code x} of travel shows as {@code max·(1 − 1/(x·give/max + 1))}, below {@code max}. */
    static float rubber(float x, float give, float max) {
        return max * (1f - 1f / (x * give / max + 1f));
    }

    /** Whether an upward drag of the open island has passed the point where letting go closes it. */
    boolean pastClose(float y) {
        return dragging() && startY - y >= ISLAND_UP_DP * density;
    }

    private boolean dragging() {
        return active && !pill && horizontal != null && !horizontal;
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

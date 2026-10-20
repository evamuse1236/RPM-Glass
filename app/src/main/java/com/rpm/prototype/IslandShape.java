package com.rpm.prototype;

/**
 * Where the black island sits, in screen pixels: the body, its corner radius and the area that takes touches. The pill
 * hugs the camera with a drop on either side; the open, habit, alert and receipt islands float as far in from each side
 * as their top is below the screen's top, with one 36dp corner (NotchGeometry).
 */
final class IslandShape {
    static final int MIN_INSET_DP = 4;
    static final int MAX_INSET_DP = 16;
    static final int TOUCH_HEIGHT_DP = 48;
    static final int SHADOW_SIDE_DP = 12;
    static final int SHADOW_BELOW_DP = 16;
    /**
     * The share of a morph in which the island's width moves: opening, it widens in the first half while it grows down
     * for the whole morph; closing, it shortens in the first half and narrows in the second. Either way its edge passes
     * the status bar's clock in a few frames.
     */
    static final float WIDTH_SHARE = 0.5f;

    final float left;
    final float top;
    final float right;
    final float bottom;
    final float radius;
    /** 0 for the pill, 1 for a floating island with its shadow. */
    final float shadow;
    final Box touch;
    private final int shadowSide;
    private final int shadowBelow;

    private IslandShape(float left, float top, float right, float bottom, float radius, float shadow, Box touch, int shadowSide, int shadowBelow) {
        this.left = left;
        this.top = top;
        this.right = right;
        this.bottom = bottom;
        this.radius = radius;
        this.shadow = shadow;
        this.touch = touch;
        this.shadowSide = shadowSide;
        this.shadowBelow = shadowBelow;
    }

    /** The collapsed pill: {@code left} px before the camera's centre and {@code right} px after it. */
    static IslandShape pill(NotchAnchor a, int displayWidth, int left, int right, float density) {
        int h = a.pillHeight;
        int w = left + right;
        int x = Math.max(dp(4, density), Math.min(a.centerX - left, displayWidth - w - dp(4, density)));
        int touchBottom = Math.max(a.pillBottom(), a.centerY + dp(TOUCH_HEIGHT_DP, density) / 2);
        return new IslandShape(x, a.pillTop(), x + w, a.pillBottom(), h / 2f, 0f,
                new Box(x, 0, x + w, touchBottom), dp(SHADOW_SIDE_DP, density), dp(SHADOW_BELOW_DP, density));
    }

    /**
     * How far the open, alert and receipt islands sit in from each side: the same gap as above their top (the pill's top),
     * so the three outer margins match; 4 to 16dp.
     */
    static int inset(NotchAnchor a, float density) {
        return Math.max(dp(MIN_INSET_DP, density), Math.min(dp(MAX_INSET_DP, density), a.pillTop()));
    }

    /**
     * The open, habit, alert or receipt island: the screen's width less {@link #inset} each side, its top at the pill's
     * top, {@code height} tall, with a 36dp corner.
     */
    static IslandShape island(NotchAnchor a, int displayWidth, int height, float density) {
        int x = inset(a, density);
        int top = a.pillTop();
        int right = displayWidth - x;
        return new IslandShape(x, top, right, top + height, dp(NotchGeometry.RADIUS_DP, density), 1f,
                new Box(x, 0, right, top + height), dp(SHADOW_SIDE_DP, density), dp(SHADOW_BELOW_DP, density));
    }

    /** The shape {@code t} of the way from {@code a} to {@code b}; touches follow the target. */
    static IslandShape lerp(IslandShape a, IslandShape b, float t) {
        return lerp(a, b, t, t);
    }

    /** The shape {@code t} of the way through a morph: the width leads when it grows and trails when it shrinks. */
    static IslandShape morph(IslandShape a, IslandShape b, float t) {
        float lead = Math.min(1f, t / WIDTH_SHARE);
        if (b.width() > a.width() + 0.5f) return lerp(a, b, lead, t);
        if (b.width() < a.width() - 0.5f) return lerp(a, b, Math.max(0f, (t - (1f - WIDTH_SHARE)) / WIDTH_SHARE), lead);
        return lerp(a, b, t, t);
    }

    private static IslandShape lerp(IslandShape a, IslandShape b, float tx, float ty) {
        return new IslandShape(mix(a.left, b.left, tx), mix(a.top, b.top, ty), mix(a.right, b.right, tx), mix(a.bottom, b.bottom, ty),
                mix(a.radius, b.radius, ty), mix(a.shadow, b.shadow, ty), b.touch, b.shadowSide, b.shadowBelow);
    }

    /**
     * How far a face {@code faceWidth} by {@code faceHeight} is shrunk while the island is {@code width} by {@code height}:
     * mid-morph it shrinks with the island toward the camera so it always fits inside it, and it is never drawn larger
     * than it is.
     */
    static float faceScale(float faceWidth, float faceHeight, float width, float height) {
        float s = 1f;
        if (faceWidth > 0f) s = Math.min(s, width / faceWidth);
        if (faceHeight > 0f) s = Math.min(s, height / faceHeight);
        return Math.max(0f, s);
    }

    float width() {
        return right - left;
    }

    float height() {
        return bottom - top;
    }

    /** The window that holds everything drawn: the touch area and the shadow. */
    Box window() {
        Box w = touch.union(Box.around(left, top, right, bottom));
        if (shadow > 0f) w = w.union(Box.around(left - shadowSide, top, right + shadowSide, bottom + shadowBelow));
        return new Box(w.left, Math.max(0, w.top), w.right, w.bottom);
    }

    private static float mix(float a, float b, float t) {
        return a + (b - a) * t;
    }

    private static int dp(float value, float density) {
        return NotchAnchor.dp(value, density);
    }
}

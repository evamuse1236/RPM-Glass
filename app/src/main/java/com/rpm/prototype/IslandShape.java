package com.rpm.prototype;

/**
 * Where the black island sits, in screen pixels: the body, its corner radius, the split circle beside the pill and
 * the area that takes touches. The pill hugs the camera; the open and alert islands float 12dp in from each side.
 */
final class IslandShape {
    static final int ISLAND_INSET_DP = 12;
    static final int OPEN_RADIUS_DP = 32;
    static final int ALERT_RADIUS_DP = 28;
    static final int SPLIT_GAP_DP = 8;
    static final int MIN_PILL_WIDTH_DP = 140;
    static final int TOUCH_HEIGHT_DP = 48;
    static final int SHADOW_SIDE_DP = 12;
    static final int SHADOW_BELOW_DP = 16;

    final float left;
    final float top;
    final float right;
    final float bottom;
    final float radius;
    final float splitCx;
    final float splitCy;
    final float splitR;
    /** 0 for the pill, 1 for a floating island with its shadow. */
    final float shadow;
    final Box touch;
    private final int shadowSide;
    private final int shadowBelow;

    private IslandShape(float left, float top, float right, float bottom, float radius, float splitCx, float splitCy, float splitR,
                        float shadow, Box touch, int shadowSide, int shadowBelow) {
        this.left = left;
        this.top = top;
        this.right = right;
        this.bottom = bottom;
        this.radius = radius;
        this.splitCx = splitCx;
        this.splitCy = splitCy;
        this.splitR = splitR;
        this.shadow = shadow;
        this.touch = touch;
        this.shadowSide = shadowSide;
        this.shadowBelow = shadowBelow;
    }

    /** The collapsed pill: {@code side} either side of the {@code keep} gap over the camera, the split circle to its left. */
    static IslandShape pill(NotchAnchor a, int displayWidth, int side, int keep, boolean split, float density) {
        int h = a.pillHeight;
        int w = side + keep + side;
        int x = Math.max(dp(4, density), Math.min(a.centerX - keep / 2 - side, displayWidth - w - dp(4, density)));
        float splitCx = split ? x - dp(SPLIT_GAP_DP, density) - h / 2f : x + h / 2f;
        int touchLeft = split ? Math.round(splitCx - h / 2f) : x;
        int touchBottom = Math.max(a.pillBottom(), a.centerY + dp(TOUCH_HEIGHT_DP, density) / 2);
        return new IslandShape(x, a.pillTop(), x + w, a.pillBottom(), h / 2f, splitCx, a.centerY, split ? h / 2f : 0f, 0f,
                new Box(touchLeft, 0, x + w, touchBottom), dp(SHADOW_SIDE_DP, density), dp(SHADOW_BELOW_DP, density));
    }

    /** The open or alert island: the screen's width less 12dp each side, its top at the pill's top, {@code height} tall. */
    static IslandShape island(NotchAnchor a, int displayWidth, int height, int radiusDp, float density) {
        int x = dp(ISLAND_INSET_DP, density);
        int top = a.pillTop();
        int right = displayWidth - x;
        return new IslandShape(x, top, right, top + height, dp(radiusDp, density), x + a.pillHeight / 2f, a.centerY, 0f, 1f,
                new Box(x, 0, right, top + height), dp(SHADOW_SIDE_DP, density), dp(SHADOW_BELOW_DP, density));
    }

    /** The shape {@code t} of the way from {@code a} to {@code b}; touches follow the target. */
    static IslandShape lerp(IslandShape a, IslandShape b, float t) {
        return new IslandShape(mix(a.left, b.left, t), mix(a.top, b.top, t), mix(a.right, b.right, t), mix(a.bottom, b.bottom, t),
                mix(a.radius, b.radius, t), mix(a.splitCx, b.splitCx, t), mix(a.splitCy, b.splitCy, t), mix(a.splitR, b.splitR, t),
                mix(a.shadow, b.shadow, t), b.touch, b.shadowSide, b.shadowBelow);
    }

    float width() {
        return right - left;
    }

    float height() {
        return bottom - top;
    }

    /** The window that holds everything drawn: the touch area, the split circle and the shadow. */
    Box window() {
        Box w = touch.union(Box.around(left, top, right, bottom));
        if (splitR > 0.5f) w = w.union(Box.around(splitCx - splitR, splitCy - splitR, splitCx + splitR, splitCy + splitR));
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

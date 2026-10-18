package com.rpm.prototype;

/** Where the island sits, in screen pixels: centred on the camera hole, or top-centre when there is none. */
final class NotchAnchor {
    static final int MIN_PILL_DP = 36;
    static final int HOLE_MARGIN_DP = 8;
    static final int FALLBACK_TOP_DP = 12;

    final boolean fromCutout;
    final int centerX;
    final int centerY;
    final int holeDiameter;
    final int pillHeight;

    private NotchAnchor(boolean fromCutout, int centerX, int centerY, int holeDiameter, int pillHeight) {
        this.fromCutout = fromCutout;
        this.centerX = centerX;
        this.centerY = centerY;
        this.holeDiameter = holeDiameter;
        this.pillHeight = pillHeight;
    }

    /**
     * A punch-hole's bounding rect usually starts at the screen's top edge, so the hole itself is the
     * square at the rect's bottom: its diameter is the rect's width.
     */
    static NotchAnchor fromCutout(int left, int top, int right, int bottom, float density) {
        int hole = Math.min(right - left, bottom - top);
        int pill = Math.max(dp(MIN_PILL_DP, density), hole + dp(HOLE_MARGIN_DP, density));
        int centerY = Math.max(pill / 2, bottom - hole / 2);
        return new NotchAnchor(true, (left + right) / 2, centerY, hole, pill);
    }

    static NotchAnchor fallback(int displayWidth, float density) {
        int pill = dp(MIN_PILL_DP, density);
        return new NotchAnchor(false, displayWidth / 2, dp(FALLBACK_TOP_DP, density) + pill / 2, 0, pill);
    }

    int pillTop() {
        return centerY - pillHeight / 2;
    }

    int pillBottom() {
        return pillTop() + pillHeight;
    }

    static int dp(float value, float density) {
        return Math.round(value * density);
    }

    @Override
    public String toString() {
        return (fromCutout ? "cutout" : "no cutout, top-centre fallback") + " centre=" + centerX + "," + centerY
                + " hole=" + holeDiameter + "px pill=" + pillHeight + "px";
    }
}

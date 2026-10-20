package com.rpm.prototype;

/** Where the island sits, in screen pixels: hugging the camera hole inside the status bar, or top-centre when there is none. */
final class NotchAnchor {
    static final int MIN_PILL_DP = 36;
    static final int ABOVE_HOLE_DP = 4;
    static final int MIN_TOP_DP = 2;
    static final int FALLBACK_TOP_DP = 12;

    final boolean fromCutout;
    final int centerX;
    final int centerY;
    final int holeWidth;
    final int pillHeight;
    private final int top;

    private NotchAnchor(boolean fromCutout, int centerX, int top, int holeWidth, int pillHeight) {
        this.fromCutout = fromCutout;
        this.centerX = centerX;
        this.top = top;
        this.centerY = top + pillHeight / 2;
        this.holeWidth = holeWidth;
        this.pillHeight = pillHeight;
    }

    /**
     * A punch-hole's bounding rect usually starts at the screen's top edge, so the hole itself is the
     * square at the rect's bottom. The pill keeps the rect's whole width clear, so a wide notch is never
     * drawn over. It starts 4dp above the hole (at least 2dp below the screen edge) and ends with the
     * status bar, so it is never taller than the bar. A status bar of 0 means unknown: the pill then
     * ends 4dp below the hole.
     */
    static NotchAnchor fromCutout(int left, int top, int right, int bottom, int statusBar, float density) {
        int width = right - left;
        int square = Math.min(width, bottom - top);
        int pillTop = Math.max(dp(MIN_TOP_DP, density), bottom - square - dp(ABOVE_HOLE_DP, density));
        int pillBottom = statusBar > 0 ? Math.max(statusBar, bottom) : bottom + dp(ABOVE_HOLE_DP, density);
        return new NotchAnchor(true, (left + right) / 2, pillTop, width, pillBottom - pillTop);
    }

    static NotchAnchor fallback(int displayWidth, float density) {
        int pill = dp(MIN_PILL_DP, density);
        return new NotchAnchor(false, displayWidth / 2, dp(FALLBACK_TOP_DP, density), 0, pill);
    }

    int pillTop() {
        return top;
    }

    int pillBottom() {
        return top + pillHeight;
    }

    static int dp(float value, float density) {
        return Math.round(value * density);
    }

    @Override
    public String toString() {
        return (fromCutout ? "cutout" : "no cutout, top-centre fallback") + " centre=" + centerX + "," + centerY
                + " hole=" + holeWidth + "px pill=" + pillTop() + ".." + pillBottom() + "px";
    }
}

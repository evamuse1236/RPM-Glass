package com.rpm.prototype;

/**
 * The island's sizes from section 0 of docs/notch-redesign-plan.md, in dp: one 36dp outer corner, a 16dp margin on all
 * four sides, and every inner shape's corner is 36 minus its inset. playground/notch-geometry.mjs is its copy.
 */
final class NotchGeometry {
    static final int RADIUS_DP = 36;
    static final int PAD_DP = 16;
    static final int CIRCLE_DP = 40;
    static final int CONTROL_DP = 40;
    static final int TOUCH_DP = 48;
    static final int ROW_DP = 44;
    static final int ROW_OUTSET_DP = 8;
    static final int BAND_GAP_DP = 12;
    static final int CONTROLS_GAP_DP = 16;
    static final int ROWS_GAP_DP = 12;
    static final int PAIR_GAP_DP = 8;
    static final int PILL_RING_DP = 28;
    static final int PILL_RING_INSET_DP = 4;
    static final int MIN_PILL_WIDTH_DP = 112;
    static final int VALUE_START_DP = 8;
    static final int VALUE_END_DP = 14;
    static final int VALUE_CAP_DP = 12;
    static final int CHIP_DP = 16;
    static final float PILL_STROKE_DP = 2.5f;
    static final float RING_STROKE_DP = 3f;
    static final float PILL_VALUE_SP = 15f;
    static final float BAND_VALUE_SP = 22f;
    static final float ALERT_TIME_SP = 17f;
    static final float MAX_HEIGHT_SHARE = 0.6f;

    private NotchGeometry() {
    }

    /** The corner of a shape {@code insetDp} inside the island: 20dp for the leading circle, the buttons and Undo. */
    static int innerRadius(int insetDp) {
        return RADIUS_DP - insetDp;
    }

    /** Where a face's words start below the island's top: the margin, the band, then the band gap. */
    static int faceTopDp() {
        return PAD_DP + CIRCLE_DP + BAND_GAP_DP;
    }

    /** A face's padding in px (start, top, end, bottom): the margin on three sides, the band above. */
    static int[] facePadding(float density) {
        int pad = dp(PAD_DP, density);
        return new int[]{pad, dp(faceTopDp(), density), pad, pad};
    }

    /** The pill's ring: 28dp, or smaller on a short pill, so its inset keeps it concentric with the pill's ends. */
    static int pillRing(int pillHeight, float density) {
        return Math.min(dp(PILL_RING_DP, density), pillHeight - 2 * dp(PILL_RING_INSET_DP, density));
    }

    /** The pill's value text size in px: 15sp, but never taller than the pill less 12dp. */
    static float pillValuePx(float scaledDensity, int pillHeight, float density) {
        return Math.min(PILL_VALUE_SP * scaledDensity, pillHeight - dp(VALUE_CAP_DP, density));
    }

    /** The ring and the value, in screen px. The same two travel between the pill and the island's band. */
    static final class Band {
        final float cx;
        final float cy;
        final float diameter;
        final float stroke;
        final float valueRight;
        final float valueCy;
        final float valuePx;

        Band(float cx, float cy, float diameter, float stroke, float valueRight, float valueCy, float valuePx) {
            this.cx = cx;
            this.cy = cy;
            this.diameter = diameter;
            this.stroke = stroke;
            this.valueRight = valueRight;
            this.valueCy = valueCy;
            this.valuePx = valuePx;
        }

        static Band lerp(Band a, Band b, float t) {
            return new Band(mix(a.cx, b.cx, t), mix(a.cy, b.cy, t), mix(a.diameter, b.diameter, t), mix(a.stroke, b.stroke, t),
                    mix(a.valueRight, b.valueRight, t), mix(a.valueCy, b.valueCy, t), mix(a.valuePx, b.valuePx, t));
        }

        float ringLeft() {
            return cx - diameter / 2f;
        }

        float ringTop() {
            return cy - diameter / 2f;
        }
    }

    /** The pill: ring at the start, inset so it is concentric with the pill's round end; value 14dp from the end. */
    static Band pill(IslandShape s, float density, float valuePx) {
        float h = s.height();
        float mid = s.top + h / 2f;
        return new Band(s.left + h / 2f, mid, pillRing(Math.round(h), density), PILL_STROKE_DP * density,
                s.right - dp(VALUE_END_DP, density), mid, valuePx);
    }

    /** The island's band: a 40dp circle at (16, 16) and the value 16dp from the end, both on the band's middle line. */
    static Band island(IslandShape s, float density, float valuePx) {
        float r = dp(CIRCLE_DP, density) / 2f;
        float mid = s.top + dp(PAD_DP, density) + r;
        return new Band(s.left + dp(PAD_DP, density) + r, mid, 2 * r, RING_STROKE_DP * density, s.right - dp(PAD_DP, density), mid, valuePx);
    }

    static int dp(float value, float density) {
        return NotchAnchor.dp(value, density);
    }

    private static float mix(float a, float b, float t) {
        return a + (b - a) * t;
    }
}

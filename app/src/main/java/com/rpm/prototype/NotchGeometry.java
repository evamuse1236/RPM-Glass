package com.rpm.prototype;

import java.util.ArrayList;
import java.util.List;

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
    static final int DROP_GAP_DP = 8;
    static final float TASK_DROP_RATIO = 18f / 11f;
    static final int HABIT_TOP_DP = PAD_DP + 24 + BAND_GAP_DP;
    static final int METER_DP = 72;
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
    static final int SHORT_TITLE_LINES = 2;

    private NotchGeometry() {
    }

    /** One way a face may shrink to fit under the cap: the rows it keeps, and whether its title is cut to two lines. */
    static final class Fit {
        final int rows;
        final boolean shortTitle;

        Fit(int rows, boolean shortTitle) {
            this.rows = rows;
            this.shortTitle = shortTitle;
        }
    }

    /**
     * Tried in order until a face fits under {@link #MAX_HEIGHT_SHARE} of the screen: the open island drops rows 3, 2, 1,
     * then any face cuts its title to {@link #SHORT_TITLE_LINES} lines. Controls and rows are never cut: a face that
     * still does not fit makes the island taller than the cap.
     */
    static List<Fit> fits(boolean open) {
        List<Fit> out = new ArrayList<>();
        for (int rows = 3; rows >= (open ? 1 : 3); rows--) out.add(new Fit(rows, false));
        out.add(new Fit(open ? 1 : 3, true));
        return out;
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

    static int dropHeight(int pillHeight, float density) {
        return pillRing(pillHeight, density);
    }

    static int taskDropWidth(int dropHeight) {
        return Math.round(dropHeight * TASK_DROP_RATIO);
    }

    static int dropInset(int pillHeight, int dropHeight) {
        return (pillHeight - dropHeight) / 2;
    }

    static int dropSide(int keep, int width, int pillHeight, int dropHeight, float density) {
        return keep / 2 + dp(DROP_GAP_DP, density) + width + dropInset(pillHeight, dropHeight);
    }

    static int bareSide(int keep, int pillHeight) {
        return Math.max(keep / 2, (pillHeight + 1) / 2);
    }

    static int[] pillSides(int taskSide, int habitSide, int bare) {
        if (taskSide > 0 && habitSide > 0) {
            int side = Math.max(taskSide, habitSide);
            return new int[]{side, side};
        }
        return new int[]{taskSide > 0 ? taskSide : bare, habitSide > 0 ? habitSide : bare};
    }

    static Box taskDrop(IslandShape s, int dropHeight, int width) {
        int left = Math.round(s.left) + dropInset(Math.round(s.height()), dropHeight), top = Math.round(s.top) + dropInset(Math.round(s.height()), dropHeight);
        return new Box(left, top, left + width, top + dropHeight);
    }

    static Box habitDrop(IslandShape s, int dropHeight, int width) {
        int right = Math.round(s.right) - dropInset(Math.round(s.height()), dropHeight), top = Math.round(s.top) + dropInset(Math.round(s.height()), dropHeight);
        return new Box(right - width, top, right, top + dropHeight);
    }

    static Band pill(IslandShape s, Box taskDrop, float density, float valuePx) {
        float mid = s.top + s.height() / 2f;
        float cx = taskDrop == null ? (s.left + s.right) / 2f : (taskDrop.left + taskDrop.right) / 2f;
        float d = taskDrop == null ? dropHeight(Math.round(s.height()), density) : taskDrop.height();
        return new Band(cx, mid, d, PILL_STROKE_DP * density, s.right - dp(VALUE_END_DP, density), mid, valuePx);
    }

    static int habitFaceTop(int pillHeight, float density) {
        return Math.max(dp(HABIT_TOP_DP, density), pillHeight + dp(BAND_GAP_DP, density));
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

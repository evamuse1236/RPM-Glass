package com.rpm.prototype;

import com.rpm.prototype.NotchScene.Look;

/** The notch's colours on black (docs/notch-redesign-plan.md, Tokens). The task blue is lighter than the planner's, for 3:1 on black. */
final class NotchInk {
    static final int WHITE = 0xFFFFFFFF;
    static final int WHITE_87 = 0xDEFFFFFF;
    static final int WHITE_70 = 0xB3FFFFFF;
    static final int WHITE_60 = 0x99FFFFFF;
    static final int TRACK = 0x2EFFFFFF;
    static final int PRESS = 0x1FFFFFFF;
    static final int SECONDARY = 0x14FFFFFF;
    static final int TASK = 0xFFA8C7FA;
    static final int EVENT = 0xFFC4C7C5;
    static final int WATER = 0xFF7CACF8;
    static final int HABIT = 0xFF6DD58C;
    static final int MEAL = 0xFFFDD663;
    static final int ALARM = 0xFFF2B8B5;
    static final int ALARM_INK = 0xFF601410;
    /** A primary control's fill: its accent 30% of the way from black. */
    static final float PRIMARY_SHARE = 0.30f;
    static final float UNDO_SHARE = 0.20f;
    static final float ALARM_DISC_SHARE = 0.24f;

    private NotchInk() {
    }

    static int accent(Look look) {
        switch (look) {
            case EVENT: return EVENT;
            case WATER: return WATER;
            case HABIT: return HABIT;
            case MEAL: return MEAL;
            case ALARM: return ALARM;
            case REMINDER: return WHITE_87;
            default: return TASK;
        }
    }

    /** {@code color} mixed into black: {@code share} of the colour, the rest black, opaque. */
    static int intoBlack(int color, float share) {
        int r = Math.round(((color >> 16) & 0xFF) * share);
        int g = Math.round(((color >> 8) & 0xFF) * share);
        int b = Math.round((color & 0xFF) * share);
        return 0xFF000000 | (r << 16) | (g << 8) | b;
    }

    /** Straight-line mix of two ARGB colours. */
    static int mix(int a, int b, float t) {
        int out = 0;
        for (int shift = 0; shift <= 24; shift += 8) {
            int ca = (a >>> shift) & 0xFF, cb = (b >>> shift) & 0xFF;
            out |= Math.round(ca + (cb - ca) * t) << shift;
        }
        return out;
    }
}

package com.rpm.prototype;

/**
 * How the island moves (docs/notch-redesign-plan.md section 4). With animations on, shapes morph, the ring and value
 * travel, a new face's rows rise 8dp one after another and changed digits roll in one slot, rightmost first. With Reduce
 * Motion (Android's "Remove animations") sizes snap, the ring snaps, the old face goes at once while the new one fades in over 150 ms, and digits cross-fade over 150 ms. Nothing
 * runs longer than 400 ms. docs/notch/motion.md lists every detail.
 */
final class NotchMotion {
    static final long OPEN_MS = 350;
    static final long CLOSE_MS = 300;
    static final long FILL_MS = 400;
    static final long FACE_OUT_MS = 90;
    /** Row 1 of a new face starts while the old face still fades out, so the island never shows an empty shape. */
    static final long FACE_IN_DELAY_MS = 50;
    static final long FACE_IN_MS = 210;
    /** Each row of a new face starts this long after the row above it. */
    static final long ROW_STAGGER_MS = 30;
    /** Rows past the fourth start with the fourth. */
    static final int ROW_STEPS = 4;
    /** One digit's roll: the old digit leaves upward while the new one enters from below, on one curve. */
    static final long ROLL_MS = 250;
    /** Each changed place to the left starts this long after the place to its right. */
    static final long ROLL_STAGGER_MS = 40;
    /** Places past the third start with the third. */
    static final int ROLL_PLACES = 3;
    static final long FADE_MS = 150;
    static final int RISE_DP = 8;
    /** A rolling digit travels 1.15 times its cap height, inside a box from its cap top to its baseline. */
    static final float ROLL_TRAVEL = 1.15f;
    /** The roll's box reaches this share of an em past the cap top and the baseline, no further. */
    static final float ROLL_PAD = 0.08f;
    static final float PRESS_SCALE = 0.97f;
    static final long PRESS_MS = 100;
    static final long PULSE_MS = 1200;
    static final float PULSE_SCALE = 1.06f;

    final boolean moves;

    private NotchMotion(boolean moves) {
        this.moves = moves;
    }

    /** {@code animatorsOn} is ValueAnimator.areAnimatorsEnabled(): false when the person removed animations. */
    static NotchMotion of(boolean animatorsOn) {
        return new NotchMotion(animatorsOn);
    }

    long morphMs(boolean opening) {
        return moves ? (opening ? OPEN_MS : CLOSE_MS) : 0;
    }

    long fillMs() {
        return moves ? FILL_MS : 0;
    }

    /** How far a new face rises into place, in dp. */
    int riseDp() {
        return moves ? RISE_DP : 0;
    }

    /** With Reduce Motion the old face goes at once, so two layouts never show through each other. */
    long faceOutMs() {
        return moves ? FACE_OUT_MS : 0;
    }

    long faceInDelayMs() {
        return moves ? FACE_IN_DELAY_MS : 0;
    }

    long faceInMs() {
        return moves ? FACE_IN_MS : FADE_MS;
    }

    /** Digits roll when animations are on; otherwise the old value fades out while the new one fades in. */
    boolean digitsRoll() {
        return moves;
    }

    /** When row {@code row} (0 at the top) of a new face starts, after the face's own delay. */
    long rowDelayMs(int row) {
        return moves ? ROW_STAGGER_MS * Math.min(Math.max(row, 0), ROW_STEPS - 1) : 0;
    }

    /** When the changed digit {@code rank} places from the rightmost changed one starts to roll. */
    long rollDelayMs(int rank) {
        return moves ? ROLL_STAGGER_MS * Math.min(Math.max(rank, 0), ROLL_PLACES - 1) : 0;
    }

    /** How long a value change plays: the last place's roll ends at 330 ms, the fade at 150 ms. */
    long valueMs() {
        return moves ? ROLL_MS + rollDelayMs(ROLL_PLACES - 1) : FADE_MS;
    }

    boolean pulses() {
        return moves;
    }

    /**
     * Which characters of {@code next} change from {@code old}, matched from the right so "9m" to "10m" moves the "10"
     * and keeps the "m". A character with nothing under it in {@code old} counts as changed.
     */
    static boolean[] changed(String old, String next) {
        boolean[] out = new boolean[next.length()];
        for (int i = 0; i < next.length(); i++) {
            int o = old.length() - next.length() + i;
            out[i] = o < 0 || old.charAt(o) != next.charAt(i);
        }
        return out;
    }
}

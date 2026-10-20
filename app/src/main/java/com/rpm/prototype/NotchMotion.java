package com.rpm.prototype;

/**
 * How the island moves (docs/notch-redesign-plan.md section 4). With animations on, shapes morph, the ring and value
 * travel, faces rise 8dp and digits roll. With Reduce Motion (Android's "Remove animations") sizes snap, the ring snaps,
 * and faces and digits cross-fade over 150 ms. Nothing runs longer than 400 ms.
 */
final class NotchMotion {
    static final long OPEN_MS = 350;
    static final long CLOSE_MS = 300;
    static final long FILL_MS = 400;
    static final long FACE_OUT_MS = 90;
    static final long FACE_IN_DELAY_MS = 90;
    static final long FACE_IN_MS = 210;
    static final long ROLL_OUT_MS = 150;
    static final long ROLL_IN_DELAY_MS = 100;
    static final long ROLL_IN_MS = 150;
    static final long FADE_MS = 150;
    static final int RISE_DP = 8;
    /** A rolling digit travels 60% of its height. */
    static final float ROLL_TRAVEL = 0.6f;
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

    long faceOutMs() {
        return moves ? FACE_OUT_MS : FADE_MS;
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

    /** How long a value change plays: the roll ends at 250 ms, the fade at 150 ms. */
    long valueMs() {
        return moves ? ROLL_IN_DELAY_MS + ROLL_IN_MS : FADE_MS;
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

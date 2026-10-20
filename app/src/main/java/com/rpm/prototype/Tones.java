package com.rpm.prototype;

final class Tones {
    static final Tones LIGHT = new Tones(
            new int[]{0xFF1E8E3E, 0xFFE37400, 0xFF1A73E8, 0xFFA142F4, 0xFFD93025, 0xFF12B5CB, 0xFFF538A0, 0xFF9AA0A6},
            0xFF1A73E8, 0xFFE37400, 0xFF1E8E3E, 0xFFFFFFFF, 0xFF747775, 0xFF1F1F1F);
    static final Tones DARK = new Tones(
            new int[]{0xFF81C995, 0xFFFCAD70, 0xFF8AB4F8, 0xFFD7AEFB, 0xFFF28B82, 0xFF78D9EC, 0xFFFF8BCB, 0xFFBDC1C6},
            0xFF8AB4F8, 0xFFFCAD70, 0xFF81C995, 0xFF131314, 0xFF8E918F, 0xFFE3E3E3);

    final int[] area;
    final int water;
    final int meal;
    final int routine;
    final int onTone;
    final int neutral;
    final int onSurface;

    private Tones(int[] area, int water, int meal, int routine, int onTone, int neutral, int onSurface) {
        this.area = area;
        this.water = water;
        this.meal = meal;
        this.routine = routine;
        this.onTone = onTone;
        this.neutral = neutral;
        this.onSurface = onSurface;
    }

    static Tones of(boolean dark) {
        return dark ? DARK : LIGHT;
    }

    int task(int colorIndex) {
        return colorIndex < 0 ? neutral : area[colorIndex % area.length];
    }

    int waterTop() {
        return NotchInk.mix(0xFFFFFFFF, water, 0.45f);
    }

    int waterDeep() {
        return NotchInk.intoBlack(water, 0.85f);
    }

    int onSurface(int percent) {
        return (Math.round(255 * percent / 100f) << 24) | (onSurface & 0xFFFFFF);
    }
}

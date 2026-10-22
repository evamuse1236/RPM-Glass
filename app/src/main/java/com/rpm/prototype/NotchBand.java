package com.rpm.prototype;

import com.rpm.prototype.NotchScene.Look;

/**
 * What the band beside the camera shows for one frame: the leading ring (or an alert's plain disc) and the trailing
 * value. The same ring and value travel between the pill and the island, so one model serves both.
 */
final class NotchBand {
    /** A progress ring around the glyph, a reminder's white disc, an alarm's red disc, or nothing (the drops, the habit island). */
    enum Disc { RING, PLAIN, ALARM, NONE }

    final Disc disc;
    final int glyph;
    final int glyphColor;
    final int accent;
    final float progress;
    /** Where a receipt's ring starts, timed from {@code startedAt}; NaN when the ring simply follows the progress. */
    final float from;
    final long startedAt;
    /** "" when the trailing slot holds a control (Undo) or nothing. */
    final String value;
    final int valueColor;
    final float valueSp;
    /** "+10m" after a snooze sits on a dim chip. */
    final boolean chip;
    final boolean pulse;

    private NotchBand(Disc disc, int glyph, int glyphColor, int accent, float progress, float from, long startedAt,
                      String value, int valueColor, float valueSp, boolean chip, boolean pulse) {
        this.disc = disc;
        this.glyph = glyph;
        this.glyphColor = glyphColor;
        this.accent = accent;
        this.progress = Math.max(0f, Math.min(1f, progress));
        this.from = from;
        this.startedAt = startedAt;
        this.value = value == null ? "" : value;
        this.valueColor = valueColor;
        this.valueSp = valueSp;
        this.chip = chip;
        this.pulse = pulse;
    }

    static NotchBand of(NotchFrame f, long now) {
        NotchScene s = f.scene;
        switch (f.mode) {
            case OPEN:
                return ring(s.heroLook, s.progress, heroValue(s), NotchInk.accent(s.heroLook), NotchGeometry.BAND_VALUE_SP, false);
            case REMINDER:
                return new NotchBand(Disc.PLAIN, R.drawable.ic_notification, NotchInk.WHITE_87, NotchInk.WHITE_87, 0f, Float.NaN, 0,
                        NotchDay.dropAmPm(f.alert.at), NotchInk.WHITE, NotchGeometry.ALERT_TIME_SP, false, false);
            case ALARM:
                return new NotchBand(Disc.ALARM, R.drawable.ic_clock, NotchInk.ALARM, NotchInk.ALARM, 0f, Float.NaN, 0,
                        NotchDay.dropAmPm(f.alert.at), NotchInk.WHITE, NotchGeometry.ALERT_TIME_SP, false, true);
            case MANAGE: {
                boolean alarm = "alarm".equals(f.managed.alert);
                String at = Math.abs(f.managed.slot.start - now) <= 12 * 60 * NotchDay.MIN ? NotchDay.dropAmPm(f.managed.at) : f.managed.at;
                return new NotchBand(alarm ? Disc.ALARM : Disc.PLAIN, alarm ? R.drawable.ic_clock : R.drawable.ic_notification,
                        alarm ? NotchInk.ALARM : NotchInk.WHITE_87, alarm ? NotchInk.ALARM : NotchInk.WHITE_87, 0f, Float.NaN, 0,
                        at, NotchInk.WHITE, NotchGeometry.ALERT_TIME_SP, false, false);
            }
            case PILL:
            case HABIT:
                return none();
            case RECEIPT: {
                NotchReceipt r = f.receipt;
                if (r.meter) return none();
                int accent = markColor(r.mark);
                return new NotchBand(Disc.RING, markIcon(r.mark), "water".equals(r.mark) || "alarm".equals(r.mark) ? accent : NotchInk.WHITE_87,
                        accent, r.to, r.from, r.startedAt, "", NotchInk.WHITE, NotchGeometry.BAND_VALUE_SP, false, false);
            }
            default:
                return none();
        }
    }

    static NotchBand none() {
        return new NotchBand(Disc.NONE, 0, 0, 0, 0f, Float.NaN, 0, "", NotchInk.WHITE, NotchGeometry.PILL_VALUE_SP, false, false);
    }

    private static NotchBand ring(Look look, float progress, String value, int valueColor, float sp, boolean chip) {
        boolean plain = look == Look.TASK || look == Look.EVENT;
        return new NotchBand(Disc.RING, icon(look), plain ? NotchInk.WHITE_87 : NotchInk.accent(look), NotchInk.accent(look),
                progress, Float.NaN, 0, value, valueColor, sp, chip, false);
    }

    /** The task island's trailing value: "45m" left, or the start "4:30". */
    static String heroValue(NotchScene s) {
        return s.hero == null ? "" : s.pillValue;
    }

    static int icon(Look look) {
        switch (look) {
            case EVENT: return R.drawable.notch_ic_event;
            case WATER: return R.drawable.notch_ic_water;
            case HABIT: return R.drawable.notch_ic_routine;
            case MEAL: return R.drawable.notch_ic_meal;
            case REMINDER: return R.drawable.ic_notification;
            case ALARM: return R.drawable.ic_clock;
            default: return R.drawable.notch_ic_task;
        }
    }

    static int markColor(String mark) {
        switch (mark) {
            case "water": return NotchInk.WATER;
            case "alarm": return NotchInk.ALARM;
            default: return NotchInk.TASK;
        }
    }

    static int markIcon(String mark) {
        switch (mark) {
            case "water": return R.drawable.notch_ic_water;
            case "reminder": return R.drawable.ic_notification;
            case "alarm": return R.drawable.ic_clock;
            case "off": return R.drawable.notch_ic_alert_off;
            default: return R.drawable.ic_check;
        }
    }

    boolean hasValue() {
        return !value.isEmpty();
    }
}

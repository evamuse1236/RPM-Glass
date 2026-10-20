package com.rpm.prototype;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.SystemClock;
import android.util.SparseArray;
import android.view.Choreographer;
import android.view.View;
import android.view.animation.Interpolator;
import android.view.animation.PathInterpolator;

/**
 * Draws the band's ring and value over the island. Both travel between the pill and the island with the morph; the
 * ring fills over 400 ms, changed digits roll, and under Reduce Motion the value cross-fades and the ring snaps.
 */
final class IslandBand {
    static final Interpolator STANDARD = new PathInterpolator(0.2f, 0f, 0f, 1f);
    static final Interpolator DECELERATE = new PathInterpolator(0.05f, 0.7f, 0.1f, 1f);
    private static final Interpolator PULSE = new PathInterpolator(0.42f, 0f, 0.58f, 1f);

    private final View host;
    private final Context context;
    private final float density;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Rect digit = new Rect();
    private final SparseArray<Drawable> glyphs = new SparseArray<>();
    private NotchBand band;
    private NotchMotion motion = NotchMotion.of(true);
    private NotchGeometry.Band from;
    private NotchGeometry.Band to;
    private float t = 1f;
    private int colorFrom;
    private float alphaFrom;
    private String shown = "";
    private String old = "";
    private long valueAt = -1;
    private float fillFrom;
    private float fillTo;
    private long fillAt = -1;
    private long fillMs;
    private long receiptStart = Long.MIN_VALUE;
    private boolean ticking;
    private final Choreographer.FrameCallback tick = nanos -> NotchController.safely("band frame", this::frame);

    IslandBand(View host) {
        this.host = host;
        this.context = host.getContext();
        density = context.getResources().getDisplayMetrics().density;
        Typeface face = Build.VERSION.SDK_INT >= 28 ? Typeface.create(Typeface.SANS_SERIF, 600, false) : Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD);
        text.setTypeface(face);
        text.setFontFeatureSettings("tnum");
    }

    /** Shows {@code next} at {@code geo}; with {@code travel}, the ring and value move there with the island's morph. */
    void set(NotchBand next, NotchGeometry.Band geo, boolean travel, NotchMotion m) {
        motion = m;
        long now = SystemClock.uptimeMillis();
        NotchGeometry.Band drawn = to == null ? geo : NotchGeometry.Band.lerp(from, to, t);
        colorFrom = band == null ? next.valueColor : valueColor();
        alphaFrom = band == null ? (next.hasValue() ? 1f : 0f) : valueAlpha();
        from = travel ? drawn : geo;
        to = geo;
        t = travel ? 0f : 1f;
        if (next.hasValue() && !next.value.equals(shown)) {
            boolean wasShown = band != null && band.hasValue() && !shown.isEmpty();
            old = wasShown ? shown : "";
            valueAt = wasShown ? now : -1;
            shown = next.value;
        }
        boolean receipt = !Float.isNaN(next.from);
        if (receipt && next.startedAt != receiptStart) {
            startFill(next.from, next.progress, next.startedAt);
        } else if (band == null || band.disc != next.disc || band.glyph != next.glyph) {
            startFill(next.progress, next.progress, now);
        } else if (Math.abs(fillTo - next.progress) > 0.0005f) {
            startFill(fill(now), next.progress, now);
        }
        receiptStart = receipt ? next.startedAt : Long.MIN_VALUE;
        band = next;
        if (!travel) {
            colorFrom = valueColor();
            alphaFrom = valueAlpha();
        }
        run();
        host.invalidate();
    }

    /** The island's morph, 0 to 1. */
    void morph(float t) {
        this.t = t;
    }

    /** The geometry the ring and value sit at this frame. */
    NotchGeometry.Band at() {
        return to == null ? null : NotchGeometry.Band.lerp(from, to, t);
    }

    void stop() {
        Choreographer.getInstance().removeFrameCallback(tick);
        ticking = false;
    }

    private void startFill(float a, float b, long at) {
        fillFrom = a;
        fillTo = b;
        fillAt = at;
        fillMs = scaled(motion.fillMs());
    }

    private float fill(long now) {
        if (fillMs <= 0 || now - fillAt >= fillMs) return fillTo;
        float p = DECELERATE.getInterpolation(Math.max(0f, (now - fillAt) / (float) fillMs));
        return fillFrom + (fillTo - fillFrom) * p;
    }

    private long scaled(long ms) {
        return motion.moves ? Math.round(ms * ValueAnimator.getDurationScale()) : ms;
    }

    private int valueColor() {
        return band == null ? 0 : NotchInk.mix(colorFrom, band.valueColor, t);
    }

    private float valueAlpha() {
        return band == null ? 0f : alphaFrom + ((band.hasValue() ? 1f : 0f) - alphaFrom) * t;
    }

    private boolean moving(long now) {
        boolean value = valueAt >= 0 && now - valueAt < scaled(motion.valueMs());
        boolean filling = fillMs > 0 && now - fillAt < fillMs;
        return value || filling || band != null && band.pulse && motion.pulses();
    }

    private void run() {
        if (ticking || !moving(SystemClock.uptimeMillis())) return;
        ticking = true;
        Choreographer.getInstance().postFrameCallback(tick);
    }

    private void frame() {
        ticking = false;
        host.invalidate();
        run();
    }

    /** Draws the ring and the value; {@code dx, dy} turn screen pixels into the host's. */
    void draw(Canvas canvas, float dx, float dy) {
        NotchGeometry.Band g = at();
        if (g == null || band == null) return;
        long now = SystemClock.uptimeMillis();
        float pulse = 1f;
        if (band.pulse && motion.pulses()) {
            float phase = (now % NotchMotion.PULSE_MS) / (float) NotchMotion.PULSE_MS;
            pulse = 1f + (NotchMotion.PULSE_SCALE - 1f) * PULSE.getInterpolation(phase < 0.5f ? phase * 2f : 2f - phase * 2f);
        }
        drawRing(canvas, paint, band, g.cx + dx, g.cy + dy, g.diameter * pulse, g.stroke, fill(now));
        drawValue(canvas, g, dx, dy, now);
    }

    void drawRing(Canvas canvas, Paint p, NotchBand b, float cx, float cy, float d, float stroke, float fill) {
        p.setStyle(Paint.Style.FILL);
        if (b.disc == NotchBand.Disc.PLAIN || b.disc == NotchBand.Disc.ALARM) {
            p.setColor(b.disc == NotchBand.Disc.ALARM ? NotchInk.intoBlack(NotchInk.ALARM, NotchInk.ALARM_DISC_SHARE) : NotchInk.PRESS);
            canvas.drawCircle(cx, cy, d / 2f, p);
        } else {
            float r = (d - stroke) / 2f;
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(stroke);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setColor(NotchInk.TRACK);
            canvas.drawCircle(cx, cy, r, p);
            if (fill > 0.001f) {
                p.setColor(b.accent);
                canvas.drawArc(cx - r, cy - r, cx + r, cy + r, -90f, 360f * Math.min(1f, fill), false, p);
            }
        }
        Drawable glyph = glyph(b.glyph);
        int half = Math.round(d / 4f);
        glyph.setTint(b.glyphColor);
        glyph.setBounds(Math.round(cx) - half, Math.round(cy) - half, Math.round(cx) + half, Math.round(cy) + half);
        glyph.draw(canvas);
    }

    private void drawValue(Canvas canvas, NotchGeometry.Band g, float dx, float dy, long now) {
        float alpha = valueAlpha();
        if (alpha <= 0.01f || shown.isEmpty()) return;
        text.setTextSize(g.valuePx);
        int color = valueColor();
        Paint.FontMetrics fm = text.getFontMetrics();
        float baseline = g.valueCy + dy - (fm.ascent + fm.descent) / 2f;
        float right = g.valueRight + dx;
        if (band.chip) {
            float w = text.measureText(shown), padX = 8 * density, padY = 2 * density;
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(NotchInk.TRACK);
            float r = g.valuePx / 2f + padY;
            canvas.drawRoundRect(right - w - padX * 2, g.valueCy + dy - r, right, g.valueCy + dy + r, r, r, paint);
            right -= padX;
        }
        long e = valueAt < 0 ? Long.MAX_VALUE : now - valueAt;
        long span = scaled(motion.valueMs());
        if (e >= span || old.isEmpty()) {
            drawChars(canvas, shown, null, right, baseline, color, alpha, 0f, 1f);
            return;
        }
        if (!motion.digitsRoll()) {
            float p = e / (float) span;
            drawChars(canvas, old, null, right, baseline, color, alpha * (1f - p), 0f, 1f);
            drawChars(canvas, shown, null, right, baseline, color, alpha * p, 0f, 1f);
            return;
        }
        float scale = span / (float) motion.valueMs();
        float out = STANDARD.getInterpolation(Math.min(1f, e / (NotchMotion.ROLL_OUT_MS * scale)));
        float in = STANDARD.getInterpolation(Math.max(0f, Math.min(1f, (e - NotchMotion.ROLL_IN_DELAY_MS * scale) / (NotchMotion.ROLL_IN_MS * scale))));
        text.getTextBounds("0", 0, 1, digit);
        float cap = -digit.top, pad = g.valuePx * NotchMotion.ROLL_PAD;
        float travel = cap * NotchMotion.ROLL_TRAVEL;
        boolean[] gone = NotchMotion.changed(shown, old);
        boolean[] came = NotchMotion.changed(old, shown);
        canvas.save();
        canvas.clipRect(0f, baseline - cap - pad, right, baseline + pad);
        drawChars(canvas, old, gone, right, baseline - travel * out, color, alpha * (1f - out), 0f, 0f);
        drawChars(canvas, shown, came, right, baseline + travel * (1f - in), color, alpha * in, 0f, 1f);
        canvas.restore();
        drawChars(canvas, shown, came, right, baseline, color, alpha, 1f, 0f);
    }

    /**
     * Draws {@code s} right-aligned at {@code right}, one character at a time. Characters marked in {@code moved} use
     * {@code movedAlpha} times {@code alpha} at {@code baseline}; the rest use {@code stillAlpha} times {@code alpha}.
     */
    private void drawChars(Canvas canvas, String s, boolean[] moved, float right, float baseline, int color, float alpha, float stillAlpha, float movedAlpha) {
        float x = right;
        for (int i = s.length() - 1; i >= 0; i--) {
            String c = String.valueOf(s.charAt(i));
            float w = text.measureText(c);
            x -= w;
            float a = moved == null ? movedAlpha : moved[i] ? movedAlpha : stillAlpha;
            if (a * alpha <= 0.01f) continue;
            text.setColor(color);
            text.setAlpha(Math.round(((color >>> 24) & 0xFF) * alpha * a));
            canvas.drawText(c, x, baseline, text);
        }
    }

    private Drawable glyph(int id) {
        Drawable d = glyphs.get(id);
        if (d == null) {
            d = context.getDrawable(id).mutate();
            glyphs.put(id, d);
        }
        return d;
    }
}

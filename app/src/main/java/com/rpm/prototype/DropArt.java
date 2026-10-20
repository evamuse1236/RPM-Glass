package com.rpm.prototype;

import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;

import java.util.List;

final class DropArt {
    private static final float VIEW = 48f;
    private static final float RING_R = 22f;
    private static final float RING_STROKE = 3f;
    private static final float GAP = 3.2f;
    private static final float INNER_R = 18f;

    final Tones tones;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path wave = new Path();
    private final Path drop = new Path();
    private final Path clip = new Path();
    private final RectF oval = new RectF();
    private LinearGradient deep;

    DropArt(Tones tones) {
        this.tones = tones;
        wave.moveTo(-24f, 0f);
        for (int x = -24; x < 72; x += 24) {
            wave.rQuadTo(6f, -2.2f, 12f, 0f);
            wave.rQuadTo(6f, 2.2f, 12f, 0f);
        }
        wave.lineTo(72f, 48f);
        wave.lineTo(-24f, 48f);
        wave.close();
        drop.moveTo(12f, 3f);
        drop.cubicTo(12f, 3f, 18f, 10f, 18f, 14.5f);
        drop.arcTo(new RectF(6f, 8.5f, 18f, 20.5f), 0f, 180f, false);
        drop.cubicTo(6f, 10f, 12f, 3f, 12f, 3f);
        drop.close();
        clip.addCircle(24f, 24f, INNER_R, Path.Direction.CW);
    }

    static float levelY(float fill) {
        return 43f - Math.min(1f, Math.max(0f, fill)) * 37f;
    }

    void water(Canvas c, float cx, float cy, float size, int goal, int from, int to, GlassTip tip) {
        int g = Math.max(1, goal);
        float fill = (from + (to - from) * tip.level) / g;
        c.save();
        c.translate(cx - size / 2f, cy - size / 2f);
        c.scale(size / VIEW, size / VIEW);
        int moving = Math.max(from, to) - 1;
        float drawn = to > from ? tip.segment : to < from ? 1f - tip.segment : 1f;
        ring(c, g, Math.min(from, to), from == to ? -1 : moving, drawn, tones.water);
        inner(c);
        c.save();
        c.clipPath(clip);
        c.translate(0f, levelY(fill));
        c.rotate(tip.degrees, 24f, 0f);
        paint.setStyle(Paint.Style.FILL);
        paint.setShader(null);
        paint.setColor(tones.water);
        paint.setAlpha(Math.round(255 * 0.4f));
        c.save();
        c.translate(-12f, 0f);
        c.drawPath(wave, paint);
        c.restore();
        paint.setAlpha(255);
        if (deep == null) deep = new LinearGradient(0f, -1.1f, 0f, 48f, tones.waterTop(), tones.waterDeep(), Shader.TileMode.CLAMP);
        paint.setShader(deep);
        c.drawPath(wave, paint);
        paint.setShader(null);
        c.restore();
        c.save();
        c.translate(17.5f, 17f);
        c.scale(0.54f, 0.54f);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(3.7f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeJoin(Paint.Join.ROUND);
        paint.setColor(to / (float) g >= 0.5f ? tones.onTone : tones.water);
        c.drawPath(drop, paint);
        c.restore();
        c.restore();
    }

    void meal(Canvas c, float cx, float cy, float size, int slots, List<Integer> logged) {
        c.save();
        c.translate(cx - size / 2f, cy - size / 2f);
        c.scale(size / VIEW, size / VIEW);
        int n = Math.max(1, slots);
        track(c, n);
        paint.setColor(tones.meal);
        for (int i : logged) if (i >= 0 && i < n) segment(c, n, i, 1f);
        inner(c);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(tones.meal);
        oval.set(12.5f, 18.5f, 35.5f, 36.5f);
        c.drawArc(oval, 0f, 180f, true, paint);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(2f);
        paint.setStrokeCap(Paint.Cap.ROUND);
        c.drawLine(19f, 37.5f, 29f, 37.5f, paint);
        c.restore();
    }

    void capsule(Canvas c, RectF box, int color, Drawable icon, int iconColor, float iconSize) {
        paint.setShader(null);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(color);
        float r = Math.min(box.width(), box.height()) / 2f;
        c.drawRoundRect(box, r, r, paint);
        int half = Math.round(iconSize / 2f);
        int x = Math.round(box.centerX()), y = Math.round(box.centerY());
        icon.setTint(iconColor);
        icon.setBounds(x - half, y - half, x + half, y + half);
        icon.draw(c);
    }

    void countdown(Canvas c, float cx, float cy, float size, float progress, int track, int color) {
        float stroke = size * 6f / VIEW, r = size * 19f / VIEW;
        paint.setShader(null);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(stroke);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setColor(track);
        c.drawCircle(cx, cy, r, paint);
        float p = Math.max(0f, Math.min(1f, progress));
        if (p <= 0.001f) return;
        paint.setColor(color);
        oval.set(cx - r, cy - r, cx + r, cy + r);
        c.drawArc(oval, -90f, 360f * p, false, paint);
    }

    private void ring(Canvas c, int n, int full, int moving, float drawn, int color) {
        track(c, n);
        paint.setColor(color);
        for (int i = 0; i < full; i++) segment(c, n, i, 1f);
        if (moving >= 0 && moving < n && drawn > 0.001f) segment(c, n, moving, drawn);
    }

    private void track(Canvas c, int n) {
        paint.setShader(null);
        int color = tones.onSurface(12);
        for (int i = 0; i < n; i++) {
            paint.setColor(color);
            segment(c, n, i, 1f);
        }
    }

    private void segment(Canvas c, int n, int i, float share) {
        float gap = (float) Math.toDegrees(GAP / RING_R);
        float each = 360f / n;
        float sweep = (each - gap) * share;
        if (sweep <= 0f) return;
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(RING_STROKE);
        paint.setStrokeCap(Paint.Cap.BUTT);
        oval.set(24f - RING_R, 24f - RING_R, 24f + RING_R, 24f + RING_R);
        c.drawArc(oval, -90f + i * each + gap / 2f, sweep, false, paint);
    }

    private void inner(Canvas c) {
        paint.setShader(null);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(tones.onSurface(4));
        c.drawCircle(24f, 24f, INNER_R, paint);
    }
}

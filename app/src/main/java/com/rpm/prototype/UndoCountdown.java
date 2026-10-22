package com.rpm.prototype;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.os.SystemClock;

/**
 * Undo's resting pill, {@code reach} inside its touch box: the task blue 20% into black, with a lighter part (34%) for
 * the time Undo has left that drains from end to start. It reads the clock each frame, so it counts down with
 * animations off too (playground/notch.css `.notch-undo::before` is its copy).
 */
final class UndoCountdown extends Drawable {
    private static final long FRAME_MS = 32;

    private final NotchReceipt receipt;
    private final int reach;
    private final float radius;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();
    private final Path shape = new Path();
    private final Runnable tick = this::invalidateSelf;

    UndoCountdown(NotchReceipt receipt, int reach, float radius) {
        this.receipt = receipt;
        this.reach = reach;
        this.radius = radius;
    }

    @Override
    public void draw(Canvas canvas) {
        Rect b = getBounds();
        box.set(b.left, b.top + reach, b.right, b.bottom - reach);
        paint.setColor(NotchInk.intoBlack(NotchInk.TASK, NotchInk.UNDO_SHARE));
        canvas.drawRoundRect(box, radius, radius, paint);
        long now = SystemClock.uptimeMillis();
        float left = receipt.undoLeft(now);
        if (left <= 0f) return;
        shape.reset();
        shape.addRoundRect(box, radius, radius, Path.Direction.CW);
        canvas.save();
        canvas.clipPath(shape);
        paint.setColor(NotchInk.intoBlack(NotchInk.TASK, NotchInk.UNDO_LEFT_SHARE));
        canvas.drawRect(box.left, box.top, box.left + box.width() * left, box.bottom, paint);
        canvas.restore();
        scheduleSelf(tick, now + FRAME_MS);
    }

    @Override
    public void setAlpha(int alpha) {
        paint.setAlpha(alpha);
    }

    @Override
    public void setColorFilter(ColorFilter filter) {
        paint.setColorFilter(filter);
    }

    @Override
    public int getOpacity() {
        return PixelFormat.TRANSLUCENT;
    }
}

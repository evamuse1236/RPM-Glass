package com.rpm.prototype;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.os.SystemClock;
import android.view.Choreographer;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Draws the one black island in screen coordinates and morphs it between the pill, the open island, the alert islands
 * and the receipt. The band's ring and value (IslandBand) travel with the morph; faces fade, and rise 8dp as they come in.
 */
final class IslandView extends ViewGroup {
    private static final long PRESS_HOLD_MS = 90;
    private static final int SHADOW = 0x40000000;

    interface Listener {
        void onGesture(IslandGesture.Result result);

        void onOutsideTap();

        void onSettled();
    }

    private static final class At extends LayoutParams {
        final RectF screen;

        At(RectF screen) {
            super((int) screen.width(), (int) screen.height());
            this.screen = new RectF(screen);
        }
    }

    /** A face's fade, timed by the clock so it also runs, unmoving, when the person removed animations. */
    private static final class Fade {
        final View view;
        final float fromAlpha;
        final float toAlpha;
        final float fromY;
        final long start;
        final long ms;
        final Runnable end;

        Fade(View view, float toAlpha, float fromY, long start, long ms, Runnable end) {
            this.view = view;
            this.fromAlpha = view.getAlpha();
            this.toAlpha = toAlpha;
            this.fromY = fromY;
            this.start = start;
            this.ms = Math.max(1, ms);
            this.end = end;
        }
    }

    private final Listener listener;
    private final IslandGesture gesture;
    private final IslandBand band;
    private final List<Fade> fades = new ArrayList<>();
    /** The faces on screen, the leaving ones too: each shrinks with the island while it morphs. */
    private final Set<View> faces = new HashSet<>();
    private boolean fading;
    private final Choreographer.FrameCallback fadeTick = nanos -> NotchController.safely("island fade", this::stepFades);
    private final Spring press = Spring.island(0.002f);
    private final Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path body = new Path();
    private final int[] loc = new int[2];
    private final int[] laidOutAt = new int[2];
    private final float density;
    private IslandShape from;
    private IslandShape to;
    private IslandShape now;
    private ValueAnimator morph;
    private View face;
    private View split;
    private boolean pressable;
    private boolean pressing;
    private long pressFrameNanos;
    private final Runnable release = () -> {
        press.target = 1f;
        pressFrame();
    };
    private final Runnable longPress = () -> NotchController.safely("island long press", this::longPress);
    private final Choreographer.FrameCallback pressTick = nanos -> NotchController.safely("island press", () -> stepPress(nanos));

    IslandView(Context context, Listener listener) {
        super(context);
        this.listener = listener;
        density = context.getResources().getDisplayMetrics().density;
        gesture = new IslandGesture(density);
        band = new IslandBand(this);
        press.snapTo(1f);
        ink.setColor(Color.BLACK);
        setWillNotDraw(false);
        setClickable(true);
        setOnClickListener(v -> listener.onGesture(IslandGesture.Result.TAP));
    }

    /**
     * Morphs to {@code shape} over {@code ms} while the band's ring and value travel to {@code bandAt}. A null
     * {@code nextFace} keeps the current content; {@code fade} fades the old face out over 0-90 ms and the new one in
     * over 90-300 ms as it rises 8dp (a 150 ms cross-fade under Reduce Motion), otherwise the content swaps at once.
     */
    void setScene(IslandShape shape, long ms, NotchMotion motion, View nextFace, RectF faceAt, boolean fade,
                  boolean replaceSplit, View nextSplit, RectF splitAt, boolean pressable, NotchBand nextBand, NotchGeometry.Band bandAt) {
        this.pressable = pressable;
        if (nextFace != null) face = swap(face, nextFace, faceAt, fade, true, motion);
        if (replaceSplit) split = swap(split, nextSplit, splitAt, true, false, motion);
        boolean travel = now != null && ms > 0 && ValueAnimator.areAnimatorsEnabled() && !same(now, shape);
        band.set(nextBand, bandAt, travel, motion);
        morphTo(shape, ms);
    }

    /** The window the island needs this frame, mid-morph included. */
    Box drawnWindow() {
        return now == null ? null : now.window();
    }

    private void morphTo(IslandShape target, long ms) {
        if (morph != null) morph.cancel();
        morph = null;
        boolean animate = now != null && ms > 0 && ValueAnimator.areAnimatorsEnabled() && !same(now, target);
        from = now;
        to = target;
        if (!animate) {
            now = target;
            band.morph(1f);
            scaleFaces();
            invalidate();
            listener.onSettled();
            return;
        }
        ValueAnimator a = ValueAnimator.ofFloat(0f, 1f);
        a.setDuration(ms);
        a.setInterpolator(IslandBand.STANDARD);
        a.addUpdateListener(v -> {
            float t = (float) v.getAnimatedValue();
            now = IslandShape.morph(from, to, t);
            band.morph(t);
            scaleFaces();
            invalidate();
        });
        a.addListener(new AnimatorListenerAdapter() {
            private boolean cancelled;

            @Override
            public void onAnimationCancel(Animator animation) {
                cancelled = true;
            }

            @Override
            public void onAnimationEnd(Animator animation) {
                if (cancelled) return;
                now = to;
                morph = null;
                band.morph(1f);
                scaleFaces();
                invalidate();
                NotchController.safely("island settled", listener::onSettled);
            }
        });
        morph = a;
        scaleFaces();
        a.start();
    }

    /** Each face shrinks with the island from its top centre, under the camera, so it always fits inside the island. */
    private void scaleFaces() {
        if (now == null) return;
        for (View f : faces) {
            RectF at = ((At) f.getLayoutParams()).screen;
            float s = IslandShape.faceScale(at.width(), at.height(), now.width(), now.height());
            f.setPivotX(at.width() / 2f);
            f.setPivotY(0f);
            f.setScaleX(s);
            f.setScaleY(s);
        }
    }

    private static boolean same(IslandShape a, IslandShape b) {
        return a.left == b.left && a.top == b.top && a.right == b.right && a.bottom == b.bottom && a.radius == b.radius
                && a.splitCx == b.splitCx && a.splitR == b.splitR && a.shadow == b.shadow;
    }

    private View swap(View old, View next, RectF at, boolean fade, boolean rise, NotchMotion motion) {
        if (old == next) return old;
        long t = SystemClock.uptimeMillis();
        float scale = motion.moves ? ValueAnimator.getDurationScale() : 1f;
        if (old != null) {
            disable(old);
            dropFades(old);
            if (fade) fades.add(new Fade(old, 0f, old.getTranslationY(), t, Math.round(motion.faceOutMs() * scale), () -> drop(old)));
            else drop(old);
        }
        if (next == null) return null;
        addView(next, new At(at));
        if (rise) faces.add(next);
        if (fade) {
            next.setAlpha(0f);
            float y = rise ? motion.riseDp() * density : 0f;
            next.setTranslationY(y);
            long delay = rise ? Math.round(motion.faceInDelayMs() * scale) : 0;
            fades.add(new Fade(next, 1f, y, t + delay, Math.round((rise ? motion.faceInMs() : motion.faceOutMs()) * scale), null));
        }
        if (!fades.isEmpty() && !fading) {
            fading = true;
            Choreographer.getInstance().postFrameCallback(fadeTick);
        }
        return next;
    }

    private void drop(View v) {
        faces.remove(v);
        removeView(v);
    }

    private void dropFades(View v) {
        for (int i = fades.size() - 1; i >= 0; i--) if (fades.get(i).view == v) fades.remove(i);
    }

    private void stepFades() {
        long t = SystemClock.uptimeMillis();
        for (int i = fades.size() - 1; i >= 0; i--) {
            Fade f = fades.get(i);
            float p = Math.max(0f, Math.min(1f, (t - f.start) / (float) f.ms));
            f.view.setAlpha(f.fromAlpha + (f.toAlpha - f.fromAlpha) * p);
            f.view.setTranslationY(f.fromY * (1f - IslandBand.STANDARD.getInterpolation(p)));
            if (p >= 1f) {
                fades.remove(i);
                if (f.end != null) f.end.run();
            }
        }
        fading = !fades.isEmpty();
        if (fading) Choreographer.getInstance().postFrameCallback(fadeTick);
    }

    private static void disable(View v) {
        v.setEnabled(false);
        v.setClickable(false);
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) disable(g.getChildAt(i));
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        if (morph != null) morph.cancel();
        morph = null;
        Choreographer.getInstance().removeFrameCallback(pressTick);
        Choreographer.getInstance().removeFrameCallback(fadeTick);
        fades.clear();
        faces.clear();
        fading = false;
        band.stop();
        removeCallbacks(release);
        removeCallbacks(longPress);
        super.onDetachedFromWindow();
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        for (int i = 0; i < getChildCount(); i++) {
            View child = getChildAt(i);
            At at = (At) child.getLayoutParams();
            child.measure(MeasureSpec.makeMeasureSpec(Math.round(at.screen.width()), MeasureSpec.EXACTLY),
                    MeasureSpec.makeMeasureSpec(Math.round(at.screen.height()), MeasureSpec.EXACTLY));
        }
        setMeasuredDimension(MeasureSpec.getSize(widthSpec), MeasureSpec.getSize(heightSpec));
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        getLocationOnScreen(laidOutAt);
        for (int i = 0; i < getChildCount(); i++) {
            View child = getChildAt(i);
            RectF s = ((At) child.getLayoutParams()).screen;
            int x = Math.round(s.left) - laidOutAt[0];
            int y = Math.round(s.top) - laidOutAt[1];
            child.layout(x, y, x + child.getMeasuredWidth(), y + child.getMeasuredHeight());
        }
    }

    @Override
    protected void dispatchDraw(Canvas canvas) {
        if (now == null) return;
        getLocationOnScreen(loc);
        int dx = laidOutAt[0] - loc[0];
        int dy = laidOutAt[1] - loc[1];
        if (dx != 0 || dy != 0) {
            for (int i = 0; i < getChildCount(); i++) {
                getChildAt(i).offsetLeftAndRight(dx);
                getChildAt(i).offsetTopAndBottom(dy);
            }
            laidOutAt[0] = loc[0];
            laidOutAt[1] = loc[1];
        }
        float x = now.left - loc[0];
        float y = now.top - loc[1];
        float w = Math.max(0f, now.width());
        float h = Math.max(0f, now.height());
        float r = Math.min(now.radius, Math.min(w, h) / 2f);
        body.reset();
        body.addRoundRect(x, y, x + w, y + h, r, r, Path.Direction.CW);
        if (now.splitR > 0.5f) body.addCircle(now.splitCx - loc[0], now.splitCy - loc[1], now.splitR, Path.Direction.CW);
        if (now.shadow > 0.01f) ink.setShadowLayer(10 * density, 0f, 4 * density, Color.argb(Math.round(Color.alpha(SHADOW) * now.shadow), 0, 0, 0));
        else ink.clearShadowLayer();
        canvas.save();
        canvas.scale(press.value, press.value, x + w / 2f, y + h / 2f);
        canvas.drawPath(body, ink);
        canvas.clipPath(body);
        super.dispatchDraw(canvas);
        band.draw(canvas, -loc[0], -loc[1]);
        canvas.restore();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_OUTSIDE:
                NotchController.safely("outside tap", listener::onOutsideTap);
                return true;
            case MotionEvent.ACTION_DOWN:
                if (now == null || !gesture.down(now.touch, screenX(e), screenY(e), e.getEventTime())) {
                    NotchController.safely("outside tap", listener::onOutsideTap);
                    return false;
                }
                if (pressable) {
                    removeCallbacks(release);
                    press.target = NotchMotion.PRESS_SCALE;
                    pressFrame();
                    postDelayed(longPress, IslandGesture.LONG_PRESS_MS);
                }
                break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                removeCallbacks(longPress);
                if (pressable) postDelayed(release, Math.max(0, PRESS_HOLD_MS - (e.getEventTime() - e.getDownTime())));
                break;
            default:
                break;
        }
        return super.dispatchTouchEvent(e);
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent e) {
        return e.getActionMasked() == MotionEvent.ACTION_MOVE && claim(e);
    }

    @Override
    public boolean performClick() {
        return super.performClick();
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_MOVE:
                claim(e);
                return true;
            case MotionEvent.ACTION_UP:
                IslandGesture.Result r = gesture.up(screenX(e), screenY(e), e.getEventTime());
                if (r == IslandGesture.Result.NONE) return true;
                if (r != IslandGesture.Result.TAP) performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
                NotchController.safely("island " + r, () -> listener.onGesture(r));
                return true;
            case MotionEvent.ACTION_CANCEL:
                gesture.cancel();
                return true;
            default:
                return true;
        }
    }

    /** Moves the gesture on; once it is a swipe, the press and the long press stop. */
    private boolean claim(MotionEvent e) {
        if (!gesture.move(screenX(e), screenY(e))) return false;
        removeCallbacks(longPress);
        if (pressable) release.run();
        return true;
    }

    private float screenX(MotionEvent e) {
        return e.getX() + laidOutAt[0];
    }

    private float screenY(MotionEvent e) {
        return e.getY() + laidOutAt[1];
    }

    private void longPress() {
        if (!gesture.longPressAt(SystemClock.uptimeMillis())) return;
        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
        release.run();
        listener.onGesture(IslandGesture.Result.LONG_PRESS);
    }

    private void pressFrame() {
        if (!ValueAnimator.areAnimatorsEnabled()) {
            press.snapTo(press.target);
            invalidate();
            return;
        }
        if (pressing) return;
        pressing = true;
        pressFrameNanos = 0;
        Choreographer.getInstance().postFrameCallback(pressTick);
    }

    private void stepPress(long nanos) {
        float dt = pressFrameNanos == 0 ? 1f / 60f : Math.min((nanos - pressFrameNanos) / 1e9f, 1f / 20f);
        pressFrameNanos = nanos;
        boolean moving = press.step(dt);
        invalidate();
        if (moving) Choreographer.getInstance().postFrameCallback(pressTick);
        else pressing = false;
    }
}

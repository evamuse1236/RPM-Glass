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
import android.os.Build;
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
    /** A fully pulled island is drawn this much smaller, from its top centre, so the pull reads as lifting it away. */
    private static final float PULL_SHRINK = 0.04f;
    /** The tick when an upward drag passes the close point. */
    private static final int THRESHOLD = Build.VERSION.SDK_INT >= 34
            ? HapticFeedbackConstants.GESTURE_THRESHOLD_ACTIVATE : HapticFeedbackConstants.CLOCK_TICK;
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
    /** The island's vertical offset while a finger drags it; it springs back to 0 when the finger lifts. */
    private final IslandDrag drag;
    private final Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint edge = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path body = new Path();
    private final int[] loc = new int[2];
    private final int[] laidOutAt = new int[2];
    private final float density;
    private IslandShape from;
    private IslandShape to;
    private IslandShape now;
    private ValueAnimator morph;
    private Spring.Curve openCurve;
    private Spring.Curve closeCurve;
    private View face;
    private boolean pressable;
    private boolean pastClose;
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
        drag = new IslandDrag(density);
        band = new IslandBand(this);
        press.snapTo(1f);
        ink.setColor(Color.BLACK);
        setWillNotDraw(false);
        setClickable(true);
        setOnClickListener(v -> listener.onGesture(IslandGesture.Result.TAP));
    }

    /**
     * Morphs to {@code shape} over {@code ms} while the band's ring and value travel to {@code bandAt}. A null
     * {@code nextFace} keeps the current content; {@code fade} fades the old face out over 0-90 ms while the new
     * face's rows rise 8dp and fade in from 50 ms, each 30 ms after the row above (under Reduce Motion the old face goes
     * at once and the new one fades in over 150 ms), otherwise the content swaps at once.
     */
    void setScene(IslandShape shape, long ms, NotchMotion motion, View nextFace, RectF faceAt, boolean fade,
                  boolean pressable, NotchBand nextBand, NotchGeometry.Band bandAt) {
        this.pressable = pressable;
        if (nextFace != null) face = swap(face, nextFace, faceAt, fade, motion);
        boolean travel = now != null && ms > 0 && ValueAnimator.areAnimatorsEnabled() && !same(now, shape);
        band.set(nextBand, bandAt, travel, motion);
        morphTo(shape, ms);
    }

    /**
     * The window the island needs from now until it reaches {@code target}: where it is drawn this frame, and, when it
     * grows, how far the spring carries it past the target. Null before the first scene.
     */
    Box windowToward(IslandShape target) {
        if (now == null) return null;
        if (!IslandShape.grows(now, target)) return now.window();
        return now.window().union(IslandShape.lerp(now, target, 1f + Spring.OVERSHOOT_BOUND).window());
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
        a.setInterpolator(curve(IslandShape.grows(from, to), ms));
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

    /** The open spring when the island grows, the critically damped one when it shrinks; built once per duration. */
    private Spring.Curve curve(boolean grows, long ms) {
        Spring.Curve c = grows ? openCurve : closeCurve;
        if (c != null && c.ms == ms) return c;
        c = new Spring.Curve(grows ? Spring.DAMPING : Spring.CLOSE_DAMPING, ms);
        if (grows) openCurve = c;
        else closeCurve = c;
        return c;
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
                && a.shadow == b.shadow;
    }

    private View swap(View old, View next, RectF at, boolean fade, NotchMotion motion) {
        if (old == next) return old;
        long t = SystemClock.uptimeMillis();
        float scale = motion.moves ? ValueAnimator.getDurationScale() : 1f;
        if (old != null) {
            disable(old);
            dropFades(old);
            if (fade && motion.faceOutMs() > 0) fades.add(new Fade(old, 0f, old.getTranslationY(), t, Math.round(motion.faceOutMs() * scale), () -> drop(old)));
            else drop(old);
        }
        if (next == null) return null;
        addView(next, new At(at));
        faces.add(next);
        if (fade) {
            float y = motion.riseDp() * density;
            long delay = Math.round(motion.faceInDelayMs() * scale);
            long ms = Math.round(motion.faceInMs() * scale);
            ViewGroup rows = motion.moves ? FaceRows.of(next) : null;
            if (rows == null) arrive(next, y, t + delay, ms);
            else for (int i = 0; i < rows.getChildCount(); i++) arrive(rows.getChildAt(i), y, t + delay + Math.round(motion.rowDelayMs(i) * scale), ms);
        }
        if (!fades.isEmpty() && !fading) {
            fading = true;
            Choreographer.getInstance().postFrameCallback(fadeTick);
        }
        return next;
    }

    private void arrive(View v, float y, long start, long ms) {
        v.setAlpha(0f);
        v.setTranslationY(y);
        fades.add(new Fade(v, 1f, y, start, ms, null));
    }

    private void drop(View v) {
        faces.remove(v);
        removeView(v);
    }

    /** Stops the fades of {@code v} and of its rows. */
    private void dropFades(View v) {
        for (int i = fades.size() - 1; i >= 0; i--) if (FaceRows.within(fades.get(i).view, v)) fades.remove(i);
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
        if (now.shadow > 0.01f) ink.setShadowLayer(10 * density, 0f, 4 * density, Color.argb(Math.round(Color.alpha(SHADOW) * now.shadow), 0, 0, 0));
        else ink.clearShadowLayer();
        canvas.save();
        canvas.translate(0f, drag.spring.value);
        float pulled = 1f - PULL_SHRINK * Math.abs(drag.spring.value) / (IslandGesture.MAX_FOLLOW_DP * density);
        canvas.scale(pulled, pulled, x + w / 2f, y);
        canvas.scale(press.value, press.value, x + w / 2f, y + h / 2f);
        canvas.drawPath(body, ink);
        canvas.clipPath(body);
        super.dispatchDraw(canvas);
        band.draw(canvas, -loc[0], -loc[1]);
        drawEdge(canvas, x, y, w, h, r);
        canvas.restore();
    }

    /** The floating island's 1dp hairline, just inside its edge, fading in as it leaves the pill. */
    private void drawEdge(Canvas canvas, float x, float y, float w, float h, float r) {
        int color = NotchInk.hairline(now.shadow);
        if ((color >>> 24) == 0) return;
        float stroke = Math.max(1f, density);
        edge.setStyle(Paint.Style.STROKE);
        edge.setStrokeWidth(stroke);
        edge.setColor(color);
        float half = stroke / 2f;
        canvas.drawRoundRect(x + half, y + half, x + w - half, y + h - half, Math.max(0f, r - half), Math.max(0f, r - half), edge);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_OUTSIDE:
                NotchController.safely("outside tap", listener::onOutsideTap);
                return true;
            case MotionEvent.ACTION_DOWN:
                pastClose = false;
                drag.down();
                if (now == null || !gesture.down(now.touch, screenX(e), screenY(e), e.getEventTime(), pressable)) {
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
                if (drag.letGo(e.getEventTime())) pressFrame();
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
                boolean ticked = r == IslandGesture.Result.UP && pastClose;
                if (r != IslandGesture.Result.TAP && !ticked) performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
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
        if (ValueAnimator.areAnimatorsEnabled()) {
            drag.follow(gesture.pull(screenY(e)), e.getEventTime());
            invalidate();
        }
        boolean past = gesture.pastClose(screenY(e));
        if (past && !pastClose) performHapticFeedback(THRESHOLD);
        pastClose = past;
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
            drag.spring.snapTo(drag.spring.target);
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
        boolean pressMoving = press.step(dt);
        boolean dragMoving = drag.spring.step(dt);
        boolean moving = pressMoving || dragMoving;
        invalidate();
        if (moving) Choreographer.getInstance().postFrameCallback(pressTick);
        else pressing = false;
    }
}

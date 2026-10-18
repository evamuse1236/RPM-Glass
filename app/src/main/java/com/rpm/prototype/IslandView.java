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
import android.view.animation.Interpolator;
import android.view.animation.LinearInterpolator;
import android.view.animation.PathInterpolator;

/** Draws the one black island in screen coordinates and morphs it between the pill, the open island and the alert islands. */
final class IslandView extends ViewGroup {
    static final long OPEN_MS = 350;
    static final long ALERT_MS = 300;
    static final long CLOSE_MS = 250;
    static final long FADE_OUT_MS = 90;
    static final long FADE_IN_DELAY_MS = 90;
    static final long FADE_IN_MS = 210;
    static final Interpolator DECELERATE = new PathInterpolator(0.05f, 0.7f, 0.1f, 1f);
    static final Interpolator ACCELERATE = new PathInterpolator(0.3f, 0f, 0.8f, 0.15f);
    static final Interpolator STANDARD = new PathInterpolator(0.2f, 0f, 0f, 1f);
    private static final float PRESSED_SCALE = 0.97f;
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

    private final Listener listener;
    private final IslandGesture gesture;
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
        press.snapTo(1f);
        ink.setColor(Color.BLACK);
        setWillNotDraw(false);
        setClickable(true);
        setOnClickListener(v -> listener.onGesture(IslandGesture.Result.TAP));
    }

    /**
     * Morphs to {@code shape} over {@code ms}. A null {@code nextFace} keeps the current content; {@code fade} cross-fades
     * old content out over 0-90ms and the new in over 90-300ms, otherwise the content swaps at once.
     */
    void setScene(IslandShape shape, long ms, Interpolator curve, View nextFace, RectF faceAt, boolean fade,
                  boolean replaceSplit, View nextSplit, RectF splitAt, boolean pressable) {
        this.pressable = pressable;
        if (nextFace != null) face = swap(face, nextFace, faceAt, fade, true);
        if (replaceSplit) split = swap(split, nextSplit, splitAt, true, false);
        morphTo(shape, ms, curve);
    }

    /** The window the island needs this frame, mid-morph included. */
    Box drawnWindow() {
        return now == null ? null : now.window();
    }

    private void morphTo(IslandShape target, long ms, Interpolator curve) {
        if (morph != null) morph.cancel();
        morph = null;
        boolean animate = now != null && ValueAnimator.areAnimatorsEnabled() && !same(now, target);
        from = now;
        to = target;
        if (!animate) {
            now = target;
            invalidate();
            listener.onSettled();
            return;
        }
        ValueAnimator a = ValueAnimator.ofFloat(0f, 1f);
        a.setDuration(ms);
        a.setInterpolator(curve);
        a.addUpdateListener(v -> {
            now = IslandShape.lerp(from, to, (float) v.getAnimatedValue());
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
                invalidate();
                NotchController.safely("island settled", listener::onSettled);
            }
        });
        morph = a;
        a.start();
    }

    private static boolean same(IslandShape a, IslandShape b) {
        return a.left == b.left && a.top == b.top && a.right == b.right && a.bottom == b.bottom && a.radius == b.radius
                && a.splitCx == b.splitCx && a.splitR == b.splitR && a.shadow == b.shadow;
    }

    private View swap(View old, View next, RectF at, boolean fade, boolean lift) {
        if (old == next) return old;
        boolean animate = fade && ValueAnimator.areAnimatorsEnabled();
        if (old != null) {
            disable(old);
            if (animate) old.animate().alpha(0f).setStartDelay(0).setDuration(FADE_OUT_MS).setInterpolator(new LinearInterpolator()).withEndAction(() -> removeView(old));
            else removeView(old);
        }
        if (next == null) return null;
        addView(next, new At(at));
        if (animate) {
            next.setAlpha(0f);
            if (lift) next.setTranslationY(-6 * density);
            next.animate().alpha(1f).translationY(0f).setStartDelay(lift ? FADE_IN_DELAY_MS : 0).setDuration(lift ? FADE_IN_MS : FADE_OUT_MS)
                    .setInterpolator(lift ? STANDARD : new LinearInterpolator());
        }
        return next;
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
        canvas.restore();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_OUTSIDE:
                NotchController.safely("outside tap", listener::onOutsideTap);
                return true;
            case MotionEvent.ACTION_DOWN:
                if (now == null || !gesture.down(now.touch, e.getRawX(), e.getRawY(), e.getEventTime())) {
                    NotchController.safely("outside tap", listener::onOutsideTap);
                    return false;
                }
                if (pressable) {
                    removeCallbacks(release);
                    press.target = PRESSED_SCALE;
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
                IslandGesture.Result r = gesture.up(e.getRawX(), e.getRawY(), e.getEventTime());
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
        if (!gesture.move(e.getRawX(), e.getRawY())) return false;
        removeCallbacks(longPress);
        if (pressable) release.run();
        return true;
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

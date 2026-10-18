package com.rpm.prototype;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.Choreographer;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;

/** Draws the black island (pill, split circle, panel with ears) in screen coordinates and springs between shapes. */
final class IslandView extends ViewGroup {
    static final long FADE_MS = 190;
    private static final float PRESSED_SCALE = 0.90f;
    private static final long PRESS_HOLD_MS = 90;
    private static final float EAR_CURVE = 0.5523f;

    interface Listener {
        void onIslandTap();

        void onOutsideTap();

        void onSettled();
    }

    /** Target geometry in screen pixels. */
    static final class Shape {
        final RectF body = new RectF();
        float bottomRadius;
        float topRadius;
        float ear;
        float splitCx;
        float splitCy;
        float splitR;
        boolean expanded;
        final RectF touch = new RectF();
    }

    private static final class At extends LayoutParams {
        final RectF screen;

        At(RectF screen) {
            super((int) screen.width(), (int) screen.height());
            this.screen = new RectF(screen);
        }
    }

    private final Listener listener;
    private final Spring left;
    private final Spring top;
    private final Spring width;
    private final Spring height;
    private final Spring bottomRadius;
    private final Spring topRadius;
    private final Spring ear;
    private final Spring splitCx;
    private final Spring splitR;
    private final Spring press = Spring.island(0.002f);
    private final Spring[] springs;
    private float splitCy;
    private boolean expanded;
    private final RectF touch = new RectF();
    private final Paint ink = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path body = new Path();
    private final Path clip = new Path();
    private final RectF scratch = new RectF();
    private final int[] loc = new int[2];
    private final int[] laidOutAt = new int[2];
    private View mainContent;
    private View splitContent;
    private boolean running;
    private long lastFrameNanos;
    private boolean pressedInside;
    private final Runnable release = () -> {
        press.target = 1f;
        kick();
    };
    private final Choreographer.FrameCallback frame = nanos -> NotchController.safely("island frame", () -> tick(nanos));

    IslandView(Context context, Listener listener) {
        super(context);
        this.listener = listener;
        float px = context.getResources().getDisplayMetrics().density * 0.5f;
        left = Spring.island(px);
        top = Spring.island(px);
        width = Spring.island(px);
        height = Spring.island(px);
        bottomRadius = Spring.island(px);
        topRadius = Spring.island(px);
        ear = Spring.island(px);
        splitCx = Spring.island(px);
        splitR = Spring.island(px);
        springs = new Spring[]{left, top, width, height, bottomRadius, topRadius, ear, splitCx, splitR, press};
        press.snapTo(1f);
        ink.setColor(Color.BLACK);
        setClickable(true);
        setOnClickListener(v -> listener.onIslandTap());
    }

    /** Moves the island toward {@code s}. A null main view keeps the current pill or panel content. */
    void setScene(Shape s, View main, RectF mainAt, boolean replaceSplit, View split, RectF splitAt, boolean firstFrame) {
        expanded = s.expanded;
        touch.set(s.touch);
        splitCy = s.splitCy;
        set(left, s.body.left, firstFrame);
        set(top, s.body.top, firstFrame);
        set(width, s.body.width(), firstFrame);
        set(height, s.body.height(), firstFrame);
        set(bottomRadius, s.bottomRadius, firstFrame);
        set(topRadius, s.topRadius, firstFrame);
        set(ear, s.ear, firstFrame);
        set(splitCx, s.splitCx, firstFrame);
        set(splitR, s.splitR, firstFrame);
        if (main != null) mainContent = swap(mainContent, main, mainAt);
        if (replaceSplit) splitContent = swap(splitContent, split, splitAt);
        kick();
    }

    /** Where anything is drawn right now, ears and split circle included. */
    RectF drawnBounds() {
        RectF r = new RectF(left.value - ear.value, top.value, left.value + width.value + ear.value, top.value + height.value);
        if (splitR.value > 0.5f) r.union(splitCx.value - splitR.value, splitCy - splitR.value, splitCx.value + splitR.value, splitCy + splitR.value);
        return r;
    }

    boolean isSettled() {
        return !running;
    }

    private static void set(Spring spring, float to, boolean snap) {
        if (snap || !ValueAnimator.areAnimatorsEnabled()) spring.snapTo(to);
        else spring.target = to;
    }

    private View swap(View old, View next, RectF at) {
        if (old == next) return old;
        boolean animate = ValueAnimator.areAnimatorsEnabled();
        if (old != null) {
            if (animate) old.animate().alpha(0f).setDuration(FADE_MS).withEndAction(() -> removeView(old));
            else removeView(old);
        }
        if (next == null) return null;
        next.setAlpha(animate ? 0f : 1f);
        addView(next, new At(at));
        if (animate) next.animate().alpha(1f).setDuration(FADE_MS);
        return next;
    }

    private void kick() {
        if (!ValueAnimator.areAnimatorsEnabled()) {
            for (Spring s : springs) s.snapTo(s.target);
            invalidate();
            running = false;
            listener.onSettled();
            return;
        }
        if (running) return;
        running = true;
        lastFrameNanos = 0;
        Choreographer.getInstance().postFrameCallback(frame);
    }

    private void tick(long nanos) {
        float dt = lastFrameNanos == 0 ? 1f / 60f : Math.min((nanos - lastFrameNanos) / 1e9f, 1f / 20f);
        lastFrameNanos = nanos;
        boolean moving = false;
        for (Spring s : springs) moving |= s.step(dt);
        invalidate();
        if (moving) {
            Choreographer.getInstance().postFrameCallback(frame);
        } else {
            running = false;
            listener.onSettled();
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        Choreographer.getInstance().removeFrameCallback(frame);
        removeCallbacks(release);
        running = false;
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
        float x = left.value - loc[0];
        float y = top.value - loc[1];
        float w = Math.max(0f, width.value);
        float h = Math.max(0f, height.value);
        buildBody(x, y, w, h);
        canvas.save();
        canvas.scale(press.value, press.value, x + w / 2f, y + h / 2f);
        canvas.drawPath(body, ink);
        clip.set(body);
        if (splitR.value > 0.5f) {
            canvas.drawCircle(splitCx.value - loc[0], splitCy - loc[1], splitR.value, ink);
            clip.addCircle(splitCx.value - loc[0], splitCy - loc[1], splitR.value, Path.Direction.CW);
        }
        canvas.clipPath(clip);
        super.dispatchDraw(canvas);
        canvas.restore();
    }

    private void buildBody(float x, float y, float w, float h) {
        body.reset();
        float rt = Math.min(Math.max(0f, topRadius.value), h / 2f);
        float rb = Math.min(Math.max(0f, bottomRadius.value), h / 2f);
        scratch.set(x, y, x + w, y + h);
        body.addRoundRect(scratch, new float[]{rt, rt, rt, rt, rb, rb, rb, rb}, Path.Direction.CW);
        float e = Math.min(ear.value, h / 2f);
        if (e < 0.5f) return;
        float k = e * (1f - EAR_CURVE);
        body.moveTo(x - e, y);
        body.lineTo(x + 1f, y);
        body.lineTo(x + 1f, y + e);
        body.lineTo(x, y + e);
        body.cubicTo(x, y + k, x - e + (e - k), y, x - e, y);
        body.close();
        float r = x + w;
        body.moveTo(r - 1f, y);
        body.lineTo(r + e, y);
        body.cubicTo(r + e - (e - k), y, r, y + k, r, y + e);
        body.lineTo(r - 1f, y + e);
        body.close();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
        if (e.getActionMasked() == MotionEvent.ACTION_OUTSIDE) {
            NotchController.safely("outside tap", listener::onOutsideTap);
            return true;
        }
        return super.dispatchTouchEvent(e);
    }

    @Override
    public boolean performClick() {
        return super.performClick();
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        boolean inside = touch.contains(e.getRawX(), e.getRawY());
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                pressedInside = inside;
                if (!inside) {
                    NotchController.safely("outside tap", listener::onOutsideTap);
                    return false;
                }
                if (!expanded) {
                    removeCallbacks(release);
                    press.target = PRESSED_SCALE;
                    kick();
                }
                return true;
            case MotionEvent.ACTION_UP:
                if (pressedInside && !expanded) {
                    long held = e.getEventTime() - e.getDownTime();
                    postDelayed(release, Math.max(0, PRESS_HOLD_MS - held));
                    if (inside) NotchController.safely("island tap", this::performClick);
                }
                pressedInside = false;
                return true;
            case MotionEvent.ACTION_CANCEL:
                pressedInside = false;
                release.run();
                return true;
            default:
                return true;
        }
    }
}

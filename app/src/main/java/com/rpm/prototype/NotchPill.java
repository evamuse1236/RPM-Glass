package com.rpm.prototype;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.util.Log;
import android.view.Display;
import android.view.DisplayCutout;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;

import com.rpm.prototype.NotchFrame.Mode;

/**
 * The overlay windows. The island draws in one pinned to the top-left corner at full width, so a morph only changes its
 * height and never its position. While the pill shows, that window takes no touches and a small touch window over each
 * drop passes taps and swipes to it, so taps beside the pill reach the app. A frame already on screen is skipped.
 */
final class NotchPill implements IslandView.Listener {
    interface Gestures {
        void onGesture(Mode mode, IslandGesture.Result result, NotchFrame.Side side);

        void onOutsideTap(Mode mode);
    }

    private final Context context;
    private final Gestures owner;
    private final WindowManager wm;
    private final int type;
    private final NotchContent content;
    private final NotchAlertViews alerts;
    private final NotchChangeViews changes;
    private final NotchHabitViews habits;
    private final IslandWindow plan = new IslandWindow();
    private IslandView island;
    private WindowManager.LayoutParams lp;
    private boolean touchable;
    private final Pad[] pads = new Pad[2];
    private NotchFrame.Side downSide = NotchFrame.Side.TASK;
    private IslandShape target;
    private Mode shownMode;
    private boolean shownMeter;
    String placement = "not shown";
    String cutoutSource = "not measured";

    NotchPill(Context context, Gestures owner, int type) {
        this.context = context;
        this.owner = owner;
        this.wm = context.getSystemService(WindowManager.class);
        this.type = type;
        this.content = new NotchContent(context);
        this.alerts = new NotchAlertViews(content);
        this.changes = new NotchChangeViews(content);
        this.habits = new NotchHabitViews(content, changes);
    }

    boolean isShown() {
        return island != null;
    }

    void hide() {
        placePads(null, null, null, null);
        if (island != null) {
            try {
                wm.removeView(island);
            } catch (RuntimeException e) {
                Log.w(NotchController.TAG, "removeView failed", e);
            }
        }
        island = null;
        target = null;
        shownMode = null;
        plan.forget();
        placement = "not shown";
    }

    void show(NotchFrame f, NotchContent.Actions actions) {
        NotchAnchor anchor = anchor();
        int displayWidth = displayWidth();
        float density = context.getResources().getDisplayMetrics().density;
        String key = f.key(anchor + "|" + displayWidth + "|" + context.getResources().getConfiguration().fontScale);
        if (island != null && plan.showing(key)) {
            speak(f);
            return;
        }

        NotchMotion motion = NotchMotion.of(ValueAnimator.areAnimatorsEnabled());
        NotchBand band = NotchBand.of(f, System.currentTimeMillis());
        float scaled = density * context.getResources().getConfiguration().fontScale;
        int h = anchor.pillHeight;
        IslandShape shape;
        View face;
        long ms;
        NotchGeometry.Band bandAt;
        Box taskPad = null, habitPad = null;
        if (f.mode == Mode.PILL) {
            int keep = Math.max(dp(24), anchor.holeWidth + dp(12));
            int drop = NotchGeometry.dropHeight(h, density);
            int taskWidth = NotchGeometry.taskDropWidth(drop);
            float valuePx = NotchGeometry.pillValuePx(scaled, h, density);
            int habitWidth = f.note != null ? valueWidth(f.pillValue(), valuePx) + (f.chip() ? 2 * dp(8) : 0) : f.habitDrop() ? drop : 0;
            int[] sides = NotchGeometry.pillSides(f.taskDrop() ? NotchGeometry.dropSide(keep, taskWidth, h, drop, density) : 0,
                    habitWidth > 0 ? NotchGeometry.dropSide(keep, habitWidth, h, drop, density) : 0, NotchGeometry.bareSide(keep, h));
            shape = IslandShape.pill(anchor, displayWidth, sides[0], sides[1], density);
            Box taskDrop = f.taskDrop() ? NotchGeometry.taskDrop(shape, drop, taskWidth) : null;
            Box habitDrop = habitWidth > 0 ? NotchGeometry.habitDrop(shape, drop, habitWidth) : null;
            face = new NotchHabitViews.Drops(context, f, local(taskDrop, shape), local(habitDrop, shape), valuePx);
            ms = motion.morphMs(false);
            bandAt = NotchGeometry.pill(shape, taskDrop, density, valuePx);
            int split = Math.round(Math.max(shape.left, Math.min(shape.right, anchor.centerX)));
            Box all = shape.touch;
            if (f.taskDrop() && habitWidth > 0) {
                taskPad = new Box(all.left, all.top, split, all.bottom);
                habitPad = new Box(split, all.top, all.right, all.bottom);
            } else if (f.taskDrop()) {
                taskPad = all;
            } else {
                habitPad = all;
            }
        } else {
            int w = displayWidth - 2 * IslandShape.inset(anchor, density);
            int cap = Math.round(displayHeight() * NotchGeometry.MAX_HEIGHT_SHARE);
            face = null;
            for (NotchGeometry.Fit fit : NotchGeometry.fits(f.mode == Mode.OPEN)) {
                content.parts.shortTitles(fit.shortTitle);
                face = face(f, actions, fit.rows, h);
                measure(face, w);
                if (face.getMeasuredHeight() <= cap) break;
            }
            content.parts.shortTitles(false);
            shape = IslandShape.island(anchor, displayWidth, Math.max(face.getMeasuredHeight(), h), density);
            ms = motion.morphMs(true);
            bandAt = NotchGeometry.island(shape, density, band.valueSp * scaled);
        }
        RectF faceAt = new RectF(shape.left, shape.top, shape.right, shape.bottom);

        boolean first = island == null;
        boolean wantTouch = f.mode != Mode.PILL;
        Box window = IslandWindow.stage(shape.window(), displayWidth);
        Box drawn = first || island.drawnWindow() == null ? window : IslandWindow.stage(island.drawnWindow(), displayWidth);
        Box resize = plan.begin(key, window, drawn, !first && ValueAnimator.areAnimatorsEnabled());
        if (first && !attach(window, wantTouch)) {
            plan.forget();
            return;
        }
        if (!first) applyWindow(resize, wantTouch);
        placePads(taskPad, habitPad, f.spoken(NotchFrame.Side.TASK), f.spoken(NotchFrame.Side.HABIT));
        boolean meter = meter(f);
        boolean fade = !first && f.mode != shownMode && !(meter && (shownMeter || shownMode == Mode.HABIT));
        target = shape;
        shownMode = f.mode;
        shownMeter = meter;
        island.setScene(shape, first ? 0 : ms, motion, face, faceAt, fade, f.mode == Mode.PILL, band, bandAt);
        placement = "window " + plan.current() + " · " + anchor + " · via " + cutoutSource;
        Log.i(NotchController.TAG, "island " + describe(f) + " " + placement);
    }

    private static boolean meter(NotchFrame f) {
        return f.mode == Mode.RECEIPT && f.receipt.meter;
    }

    private static RectF local(Box screen, IslandShape shape) {
        if (screen == null) return null;
        return new RectF(screen.left - shape.left, screen.top - shape.top, screen.right - shape.left, screen.bottom - shape.top);
    }

    private void speak(NotchFrame f) {
        if (pads[0] != null) pads[0].setContentDescription(f.spoken(pads[0].side));
        if (pads[1] != null) pads[1].setContentDescription(f.spoken(pads[1].side));
    }

    private View face(NotchFrame f, NotchContent.Actions actions, int rows, int pillHeight) {
        if (f.mode == Mode.OPEN) return content.panel(f.scene, actions, rows);
        if (f.mode == Mode.HABIT) return habits.habit(f.scene, pillHeight, actions);
        if (f.mode == Mode.MANAGE) return changes.manage(f.managed, actions);
        if (f.mode == Mode.RECEIPT && f.receipt.meter) return habits.receipt(f.receipt, pillHeight, actions);
        if (f.mode == Mode.RECEIPT) return changes.receipt(f.receipt, actions);
        if (f.mode == Mode.REMINDER) return alerts.reminder(f.alert, actions);
        return alerts.alarm(f.alert, actions);
    }

    private static void measure(View face, int width) {
        face.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
    }

    /** The value's width at {@code px}, in the band's own type: 600 weight, tabular digits. */
    private static int valueWidth(String value, float px) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setTypeface(NotchParts.typeface(600));
        p.setFontFeatureSettings("tnum");
        p.setTextSize(px);
        return (int) Math.ceil(p.measureText(value)) + 1;
    }

    private int displayHeight() {
        if (Build.VERSION.SDK_INT >= 30) return wm.getMaximumWindowMetrics().getBounds().height();
        return context.getResources().getDisplayMetrics().heightPixels;
    }

    private static String describe(NotchFrame f) {
        if (f.mode == Mode.PILL) return "drops task=" + (f.taskDrop() ? f.scene.hero.task.id : "-") + " habit=" + (f.habitDrop() ? f.scene.topHabit : "-")
                + (f.note != null ? " note=" + f.pillValue() : "");
        if (f.mode == Mode.OPEN) return "expanded";
        if (f.mode == Mode.HABIT) return "habit " + f.scene.topHabit + " " + f.scene.habitLine();
        if (f.mode == Mode.MANAGE) return "manage " + f.managed.alert + " " + f.managed.title;
        if (f.mode == Mode.RECEIPT) return "receipt " + f.receipt.state + " " + f.receipt.title + " · " + f.receipt.detail + (f.receipt.canUndo() ? " · Undo" : "");
        return f.mode.name().toLowerCase(java.util.Locale.ROOT) + " " + f.alert.title;
    }

    @Override
    public void onGesture(IslandGesture.Result result) {
        if (shownMode != null) owner.onGesture(shownMode, result, downSide);
    }

    @Override
    public void onOutsideTap() {
        if (shownMode != null) owner.onOutsideTap(shownMode);
    }

    @Override
    public void onSettled() {
        if (island == null || target == null) return;
        Box settled = plan.settle(IslandWindow.stage(target.window(), displayWidth()));
        if (settled != null) applyWindow(settled, touchable);
    }

    private WindowManager.LayoutParams overlay(Box bounds, int flags, String title) {
        WindowManager.LayoutParams p = new WindowManager.LayoutParams(bounds.width(), bounds.height(), type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                        | flags,
                PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP | Gravity.START;
        p.x = bounds.left;
        p.y = bounds.top;
        p.setTitle(title);
        if (Build.VERSION.SDK_INT >= 30) {
            p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            p.setFitInsetsTypes(0);
        } else if (Build.VERSION.SDK_INT >= 28) {
            p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        return p;
    }

    private static int touchFlags(boolean touchable) {
        return touchable ? WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH : WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
    }

    private boolean attach(Box bounds, boolean wantTouch) {
        island = new IslandView(context, this);
        touchable = wantTouch;
        lp = overlay(bounds, touchFlags(wantTouch), "RPM notch");
        try {
            wm.addView(island, lp);
            return true;
        } catch (RuntimeException e) {
            island = null;
            placement = "addView failed: " + e.getClass().getSimpleName() + ": " + e.getMessage();
            Log.w(NotchController.TAG, placement);
            return false;
        }
    }

    /** Resizes the drawing window when {@code bounds} is set, and lets it take touches only when {@code wantTouch}. */
    private void applyWindow(Box bounds, boolean wantTouch) {
        if (island == null || (bounds == null && wantTouch == touchable)) return;
        if (bounds != null) {
            lp.x = bounds.left;
            lp.y = bounds.top;
            lp.width = bounds.width();
            lp.height = bounds.height();
            placement = "window " + bounds + " · via " + cutoutSource;
        }
        lp.flags = (lp.flags & ~touchFlags(true) & ~touchFlags(false)) | touchFlags(wantTouch);
        touchable = wantTouch;
        wm.updateViewLayout(island, lp);
    }

    private void placePads(Box task, Box habit, CharSequence taskSpoken, CharSequence habitSpoken) {
        placePad(0, NotchFrame.Side.TASK, task, taskSpoken);
        placePad(1, NotchFrame.Side.HABIT, habit, habitSpoken);
    }

    private void placePad(int i, NotchFrame.Side side, Box box, CharSequence spoken) {
        Pad pad = pads[i];
        if (box == null) {
            if (pad != null) {
                try {
                    wm.removeView(pad);
                } catch (RuntimeException e) {
                    Log.w(NotchController.TAG, "removeView pad failed", e);
                }
            }
            pads[i] = null;
            return;
        }
        if (pad == null) {
            Pad next = new Pad(context, side);
            next.lp = overlay(box, 0, "RPM notch touch " + side.name().toLowerCase(java.util.Locale.ROOT));
            try {
                wm.addView(next, next.lp);
                pads[i] = pad = next;
            } catch (RuntimeException e) {
                Log.w(NotchController.TAG, "addView pad failed", e);
                return;
            }
        } else if (!box.equals(pad.box)) {
            pad.lp.x = box.left;
            pad.lp.y = box.top;
            pad.lp.width = box.width();
            pad.lp.height = box.height();
            wm.updateViewLayout(pad, pad.lp);
        }
        pad.box = box;
        pad.setContentDescription(spoken);
    }

    private final class Pad extends View {
        final NotchFrame.Side side;
        WindowManager.LayoutParams lp;
        Box box;

        Pad(Context context, NotchFrame.Side side) {
            super(context);
            this.side = side;
            setClickable(true);
            setOnClickListener(v -> {
                downSide = side;
                onGesture(IslandGesture.Result.TAP);
            });
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent e) {
            if (island == null || box == null) return false;
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) downSide = side;
            MotionEvent screen = MotionEvent.obtain(e);
            screen.offsetLocation(box.left, box.top);
            try {
                return island.dispatchTouchEvent(screen);
            } finally {
                screen.recycle();
            }
        }
    }

    private NotchAnchor anchor() {
        Rect hole = topCutout();
        float density = context.getResources().getDisplayMetrics().density;
        if (hole == null) return NotchAnchor.fallback(displayWidth(), density);
        return NotchAnchor.fromCutout(hole.left, hole.top, hole.right, hole.bottom, statusBarHeight(), density);
    }

    /** The status bar's height in pixels, even while it is hidden; 0 when the phone does not say. */
    private int statusBarHeight() {
        if (Build.VERSION.SDK_INT >= 30) {
            int top = wm.getMaximumWindowMetrics().getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.statusBars()).top;
            if (top > 0) return top;
        }
        int id = context.getResources().getIdentifier("status_bar_height", "dimen", "android");
        return id == 0 ? 0 : context.getResources().getDimensionPixelSize(id);
    }

    /** The cutout from the window insets; the Display's own cutout only when insets are unavailable. */
    private Rect topCutout() {
        if (Build.VERSION.SDK_INT < 29) {
            cutoutSource = "none (Android 9 or older)";
            return null;
        }
        DisplayCutout cutout = null;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsets insets = wm.getMaximumWindowMetrics().getWindowInsets();
            cutout = insets.getDisplayCutout();
            cutoutSource = "window insets";
        }
        if (cutout == null) {
            Display display = context.getSystemService(DisplayManager.class).getDisplay(Display.DEFAULT_DISPLAY);
            cutout = display == null ? null : display.getCutout();
            cutoutSource = "Display.getCutout";
        }
        if (cutout == null) {
            cutoutSource = "none reported";
            return null;
        }
        Rect top = null;
        for (Rect r : cutout.getBoundingRects()) {
            if (!r.isEmpty() && (top == null || r.top < top.top)) top = r;
        }
        if (top == null) cutoutSource += " (no rects)";
        else cutoutSource += " " + top.toShortString();
        return top;
    }

    private int displayWidth() {
        if (Build.VERSION.SDK_INT >= 30) return wm.getMaximumWindowMetrics().getBounds().width();
        return context.getResources().getDisplayMetrics().widthPixels;
    }

    private int dp(int value) {
        return NotchAnchor.dp(value, context.getResources().getDisplayMetrics().density);
    }
}

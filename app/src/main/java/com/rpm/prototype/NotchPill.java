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
 * Two overlay windows. The island draws in one pinned to the top-left corner at full width, so a morph only changes its
 * height and never its position. While the pill shows, that window takes no touches and a small touch window over the
 * pill passes taps and swipes to it, so taps beside the pill reach the app. A frame already on screen is skipped.
 */
final class NotchPill implements IslandView.Listener {
    interface Gestures {
        void onGesture(Mode mode, IslandGesture.Result result);

        void onOutsideTap(Mode mode);
    }

    private final Context context;
    private final Gestures owner;
    private final WindowManager wm;
    private final int type;
    private final NotchContent content;
    private final NotchAlertViews alerts;
    private final NotchChangeViews changes;
    private final IslandWindow plan = new IslandWindow();
    private IslandView island;
    private WindowManager.LayoutParams lp;
    private boolean touchable;
    private View pad;
    private WindowManager.LayoutParams padLp;
    private Box padBox;
    private IslandShape target;
    private Mode shownMode;
    private String splitKey;
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
    }

    boolean isShown() {
        return island != null;
    }

    void hide() {
        placePad(null, null);
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
        splitKey = null;
        plan.forget();
        placement = "not shown";
    }

    void show(NotchFrame f, NotchContent.Actions actions) {
        NotchAnchor anchor = anchor();
        int displayWidth = displayWidth();
        float density = context.getResources().getDisplayMetrics().density;
        String key = f.key(anchor + "|" + displayWidth + "|" + context.getResources().getConfiguration().fontScale);
        if (island != null && plan.showing(key)) return;

        NotchMotion motion = NotchMotion.of(ValueAnimator.areAnimatorsEnabled());
        NotchBand band = NotchBand.of(f, System.currentTimeMillis());
        float scaled = density * context.getResources().getConfiguration().fontScale;
        int h = anchor.pillHeight;
        IslandShape shape;
        View face;
        long ms;
        NotchGeometry.Band bandAt;
        if (f.mode == Mode.PILL) {
            int keep = Math.max(dp(24), anchor.holeDiameter + dp(12));
            int ring = NotchGeometry.pillRing(h, density);
            int lead = (h - ring) / 2 + ring + dp(NotchGeometry.VALUE_START_DP);
            float valuePx = NotchGeometry.pillValuePx(scaled, h, density);
            int trail = dp(NotchGeometry.VALUE_START_DP) + valueWidth(band.value, valuePx) + dp(NotchGeometry.VALUE_END_DP)
                    + (band.chip ? dp(NotchGeometry.CHIP_DP) : 0);
            int side = NotchAnchor.pillSide(lead, trail, keep, dp(NotchGeometry.MIN_PILL_WIDTH_DP));
            shape = IslandShape.pill(anchor, displayWidth, side, keep, f.secondary != null, density);
            face = content.pill();
            ms = motion.morphMs(false);
            bandAt = NotchGeometry.pill(shape, density, valuePx);
        } else {
            int w = displayWidth - 2 * dp(IslandShape.ISLAND_INSET_DP);
            int cap = Math.round(displayHeight() * NotchGeometry.MAX_HEIGHT_SHARE);
            face = null;
            for (NotchGeometry.Fit fit : NotchGeometry.fits(f.mode == Mode.OPEN)) {
                content.parts.shortTitles(fit.shortTitle);
                face = face(f, actions, fit.rows);
                measure(face, w);
                if (face.getMeasuredHeight() <= cap) break;
            }
            content.parts.shortTitles(false);
            shape = IslandShape.island(anchor, displayWidth, Math.max(face.getMeasuredHeight(), h), density);
            ms = motion.morphMs(true);
            bandAt = NotchGeometry.island(shape, density, band.valueSp * scaled);
        }
        RectF faceAt = new RectF(shape.left, shape.top, shape.right, shape.bottom);

        NotchBand splitBand = f.mode == Mode.PILL && f.secondary != null ? NotchBand.split(f.secondary.kind, f.scene) : null;
        String nextSplitKey = splitBand == null ? null : splitBand.glyph + ":" + Math.round(splitBand.progress * 100) + ":" + Math.round(shape.splitCx);
        boolean splitChanged = nextSplitKey == null ? splitKey != null : !nextSplitKey.equals(splitKey);
        View split = splitChanged && splitBand != null ? content.split(splitBand, NotchGeometry.pillRing(h, density)) : null;
        RectF splitAt = new RectF(shape.splitCx - h / 2f, anchor.pillTop(), shape.splitCx + h / 2f, anchor.pillBottom());
        splitKey = nextSplitKey;

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
        placePad(f.mode == Mode.PILL ? shape.touch : null, f.mode == Mode.PILL ? f.spoken() : null);
        boolean fade = !first && f.mode != shownMode;
        target = shape;
        shownMode = f.mode;
        island.setScene(shape, first ? 0 : ms, motion, face, faceAt, fade, splitChanged, split, splitAt, f.mode == Mode.PILL, band, bandAt);
        placement = "window " + plan.current() + " · " + anchor + " · via " + cutoutSource;
        Log.i(NotchController.TAG, "island " + describe(f) + " " + placement);
    }

    private View face(NotchFrame f, NotchContent.Actions actions, int rows) {
        if (f.mode == Mode.OPEN) return content.panel(f.scene, actions, rows);
        if (f.mode == Mode.MANAGE) return changes.manage(f.managed, actions);
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
        if (f.mode == Mode.PILL) return (f.primary == null ? "NOTE" : f.primary.kind) + " " + f.pillValue();
        if (f.mode == Mode.OPEN) return "expanded";
        if (f.mode == Mode.MANAGE) return "manage " + f.managed.alert + " " + f.managed.title;
        if (f.mode == Mode.RECEIPT) return "receipt " + f.receipt.state + " " + f.receipt.title + " · " + f.receipt.detail + (f.receipt.canUndo() ? " · Undo" : "");
        return f.mode.name().toLowerCase(java.util.Locale.ROOT) + " " + f.alert.title;
    }

    @Override
    public void onGesture(IslandGesture.Result result) {
        if (shownMode != null) owner.onGesture(shownMode, result);
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
            splitKey = null;
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

    /** Puts the pill's touch window over {@code box}, or removes it when {@code box} is null. */
    private void placePad(Box box, CharSequence spoken) {
        if (box == null) {
            if (pad != null) {
                try {
                    wm.removeView(pad);
                } catch (RuntimeException e) {
                    Log.w(NotchController.TAG, "removeView pad failed", e);
                }
            }
            pad = null;
            padBox = null;
            return;
        }
        if (pad == null) {
            Pad next = new Pad(context);
            padLp = overlay(box, 0, "RPM notch touch");
            try {
                wm.addView(next, padLp);
                pad = next;
            } catch (RuntimeException e) {
                Log.w(NotchController.TAG, "addView pad failed", e);
                return;
            }
        } else if (!box.equals(padBox)) {
            padLp.x = box.left;
            padLp.y = box.top;
            padLp.width = box.width();
            padLp.height = box.height();
            wm.updateViewLayout(pad, padLp);
        }
        padBox = box;
        pad.setContentDescription(spoken);
    }

    /** The pill's touch window: hands every touch to the island in screen coordinates, which are the island's own. */
    private final class Pad extends View {
        Pad(Context context) {
            super(context);
            setClickable(true);
            setOnClickListener(v -> onGesture(IslandGesture.Result.TAP));
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent e) {
            if (island == null || padBox == null) return false;
            MotionEvent screen = MotionEvent.obtain(e);
            screen.offsetLocation(padBox.left, padBox.top);
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

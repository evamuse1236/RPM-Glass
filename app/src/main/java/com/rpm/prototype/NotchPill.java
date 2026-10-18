package com.rpm.prototype;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.util.Log;
import android.view.Display;
import android.view.DisplayCutout;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;

import com.rpm.prototype.NotchScene.Look;
import com.rpm.prototype.PillPriority.Item;
import com.rpm.prototype.PillPriority.Kind;

/** One overlay window holding the island. Collapsed, the window is only as big as the pill, so taps beside it reach the app. */
final class NotchPill implements IslandView.Listener {
    private static final int EAR_DP = 14;
    private static final int PANEL_MARGIN_DP = 6;
    private static final int PANEL_RADIUS_DP = 32;
    private static final int SPLIT_GAP_DP = 8;
    private static final int MIN_PILL_WIDTH_DP = 140;
    private static final int TOUCH_HEIGHT_DP = 48;

    private final Context context;
    private final NotchController owner;
    private final WindowManager wm;
    private final int type;
    private final NotchContent content;
    private IslandView island;
    private WindowManager.LayoutParams lp;
    private final Rect window = new Rect();
    private final Rect settledWindow = new Rect();
    private String mainKey;
    private String splitKey;
    String placement = "not shown";
    String cutoutSource = "not measured";

    NotchPill(Context context, NotchController owner, int type) {
        this.context = context;
        this.owner = owner;
        this.wm = context.getSystemService(WindowManager.class);
        this.type = type;
        this.content = new NotchContent(context);
    }

    boolean isShown() {
        return island != null;
    }

    void hide() {
        if (island != null) {
            try {
                wm.removeView(island);
            } catch (RuntimeException e) {
                Log.w(NotchController.TAG, "removeView failed", e);
            }
        }
        island = null;
        mainKey = null;
        splitKey = null;
        placement = "not shown";
    }

    void show(Item primary, Item secondary, boolean expanded, NotchScene scene, NotchContent.Actions actions) {
        NotchAnchor anchor = anchor();
        int displayWidth = displayWidth();
        int h = anchor.pillHeight;
        IslandView.Shape s = new IslandView.Shape();
        s.expanded = expanded;
        s.splitCy = anchor.centerY;
        View main = null;
        RectF mainAt;
        View split = null;
        RectF splitAt = null;
        String nextSplitKey = "none";
        if (expanded) {
            int ear = dp(EAR_DP);
            int x = dp(PANEL_MARGIN_DP) + ear;
            int w = displayWidth - 2 * x;
            int topInset = anchor.pillBottom() + dp(10);
            View panel = content.panel(topInset, scene, actions);
            panel.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            int ph = panel.getMeasuredHeight();
            s.body.set(x, 0, x + w, ph);
            s.bottomRadius = dp(PANEL_RADIUS_DP);
            s.topRadius = 0;
            s.ear = ear;
            s.splitCx = x + h / 2f;
            s.splitR = 0;
            s.touch.set(x - ear, 0, x + w + ear, ph);
            mainAt = new RectF(s.body);
            String key = "panel:" + w + ":" + scene.key();
            if (!key.equals(mainKey)) {
                main = panel;
                mainKey = key;
            }
        } else {
            String value = primary.text;
            int keep = Math.max(dp(24), anchor.holeDiameter + dp(12));
            int side = NotchAnchor.pillSide(content.leadWidth(h), content.trailWidth(value), keep, dp(MIN_PILL_WIDTH_DP));
            int w = side + keep + side;
            int x = clamp(anchor.centerX - keep / 2 - side, dp(4), displayWidth - w - dp(4));
            s.body.set(x, anchor.pillTop(), x + w, anchor.pillTop() + h);
            s.bottomRadius = h / 2f;
            s.topRadius = h / 2f;
            s.ear = 0;
            mainAt = new RectF(s.body);
            if (secondary != null) {
                s.splitR = h / 2f;
                s.splitCx = x - dp(SPLIT_GAP_DP) - h / 2f;
                splitAt = new RectF(s.splitCx - h / 2f, anchor.pillTop(), s.splitCx + h / 2f, anchor.pillTop() + h);
                Look splitLook = NotchContent.look(secondary.kind, scene);
                nextSplitKey = splitLook + ":" + Math.round(s.splitCx);
                if (!nextSplitKey.equals(splitKey)) split = content.split(splitLook, h);
            } else {
                s.splitR = 0;
                s.splitCx = x + h / 2f;
            }
            float touchBottom = Math.max(s.body.bottom, anchor.centerY + dp(TOUCH_HEIGHT_DP) / 2f);
            s.touch.set(secondary != null ? splitAt.left : x, 0, x + w, touchBottom);
            Look look = NotchContent.look(primary.kind, scene);
            String key = "pill:" + look + ":" + value + ":" + w;
            if (!key.equals(mainKey)) {
                main = content.pill(look, value, h, side, keep, side);
                mainKey = key;
            }
        }
        boolean splitChanged = !nextSplitKey.equals(splitKey);
        splitKey = nextSplitKey;

        Rect target = new Rect();
        s.touch.roundOut(target);
        settledWindow.set(target);
        boolean firstFrame = island == null;
        if (firstFrame && !attach(target)) return;
        if (!firstFrame && ValueAnimator.areAnimatorsEnabled()) {
            RectF drawn = island.drawnBounds();
            Rect union = new Rect(target);
            union.union(window);
            union.union(Math.round(drawn.left), Math.round(drawn.top), Math.round(drawn.right), Math.round(drawn.bottom));
            moveWindow(union);
        }
        island.setContentDescription(describe(primary, secondary, expanded, scene));
        island.setScene(s, main, mainAt, splitChanged, split, splitAt, firstFrame);
        placement = "window " + window.toShortString() + " · " + anchor + " · via " + cutoutSource;
        Log.i(NotchController.TAG, "island " + (expanded ? "expanded" : primary.kind + " " + primary.text) + " " + placement);
    }

    @Override
    public void onIslandTap() {
        owner.setExpanded(true);
    }

    @Override
    public void onOutsideTap() {
        if (owner.expanded) owner.setExpanded(false);
    }

    @Override
    public void onSettled() {
        if (island != null) moveWindow(settledWindow);
    }

    private boolean attach(Rect bounds) {
        island = new IslandView(context, this);
        lp = new WindowManager.LayoutParams(bounds.width(), bounds.height(), type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                        | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.x = bounds.left;
        lp.y = bounds.top;
        lp.setTitle("RPM notch");
        if (Build.VERSION.SDK_INT >= 30) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            lp.setFitInsetsTypes(0);
        } else if (Build.VERSION.SDK_INT >= 28) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        try {
            wm.addView(island, lp);
            window.set(bounds);
            return true;
        } catch (RuntimeException e) {
            island = null;
            mainKey = null;
            splitKey = null;
            placement = "addView failed: " + e.getClass().getSimpleName() + ": " + e.getMessage();
            Log.w(NotchController.TAG, placement);
            return false;
        }
    }

    private void moveWindow(Rect bounds) {
        if (bounds.equals(window) || island == null) return;
        lp.x = bounds.left;
        lp.y = bounds.top;
        lp.width = bounds.width();
        lp.height = bounds.height();
        wm.updateViewLayout(island, lp);
        window.set(bounds);
        placement = "window " + window.toShortString() + " · via " + cutoutSource;
    }

    private static String describe(Item primary, Item secondary, boolean expanded, NotchScene scene) {
        if (expanded) return "Notch panel. Tap outside to close.";
        String also = secondary == null ? "" : ". Also " + spoken(secondary, scene);
        return spoken(primary, scene) + also + ". Tap to open.";
    }

    private static String spoken(Item item, NotchScene scene) {
        if (item.kind == Kind.WATER) return "Water due, " + scene.water.count + " of " + scene.water.goal + " glasses";
        if (item.kind == Kind.HABIT) return scene.habit.routine.name + ", " + scene.habit.done + " of " + scene.habit.total + " steps done";
        return scene.spoken;
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

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(v, hi));
    }
}

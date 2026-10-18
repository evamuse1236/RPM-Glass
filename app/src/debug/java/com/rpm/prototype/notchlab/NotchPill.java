package com.rpm.prototype.notchlab;

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

import com.rpm.prototype.notchlab.PillPriority.Item;
import java.util.Locale;
import com.rpm.prototype.notchlab.PillPriority.Kind;

/** One overlay window holding the island. Collapsed, the window is only as big as the pill, so taps beside it reach the app. */
final class NotchPill implements IslandView.Listener {
    private static final int EAR_DP = 14;
    private static final int PANEL_MARGIN_DP = 6;
    private static final int PANEL_RADIUS_DP = 32;
    private static final int SPLIT_GAP_DP = 8;
    private static final int MIN_PILL_WIDTH_DP = 140;
    private static final int TOUCH_HEIGHT_DP = 48;

    final String name;
    private final Context context;
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

    NotchPill(Context context, int type, String name) {
        this.context = context;
        this.wm = context.getSystemService(WindowManager.class);
        this.type = type;
        this.name = name;
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
                Log.w(LiveUpdates.TAG, name + " removeView failed", e);
            }
        }
        island = null;
        mainKey = null;
        splitKey = null;
        placement = "not shown";
    }

    void show(Item primary, Item secondary, boolean expanded, NotchContent.Actions actions) {
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
            View panel = content.panel(topInset, "Write RM essay", "Study · 25 min left", 20, 25, rows(primary), actions);
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
            String key = "panel:" + rowsKey(primary);
            if (!key.equals(mainKey)) {
                main = panel;
                mainKey = key;
            }
        } else {
            String value = valueFor(primary);
            int lead = content.leadWidth(h);
            int keep = Math.max(dp(24), anchor.holeDiameter + dp(12));
            int trail = Math.max(content.trailWidth(value), dp(MIN_PILL_WIDTH_DP) - lead - keep);
            int w = lead + keep + trail;
            int x = clamp(anchor.centerX - keep / 2 - lead, dp(4), displayWidth - w - dp(4));
            s.body.set(x, anchor.pillTop(), x + w, anchor.pillTop() + h);
            s.bottomRadius = h / 2f;
            s.topRadius = h / 2f;
            s.ear = 0;
            mainAt = new RectF(s.body);
            if (secondary != null) {
                s.splitR = h / 2f;
                s.splitCx = x - dp(SPLIT_GAP_DP) - h / 2f;
                splitAt = new RectF(s.splitCx - h / 2f, anchor.pillTop(), s.splitCx + h / 2f, anchor.pillTop() + h);
                nextSplitKey = secondary.kind.name() + ":" + Math.round(s.splitCx);
                if (!nextSplitKey.equals(splitKey)) split = content.split(secondary.kind, h);
            } else {
                s.splitR = 0;
                s.splitCx = x + h / 2f;
            }
            float touchBottom = Math.max(s.body.bottom, anchor.centerY + dp(TOUCH_HEIGHT_DP) / 2f);
            s.touch.set(secondary != null ? splitAt.left : x, 0, x + w, touchBottom);
            String key = "pill:" + primary.kind + ":" + value + ":" + w;
            if (!key.equals(mainKey)) {
                main = content.pill(primary.kind, value, h, lead, keep, trail);
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
        island.setContentDescription(describe(primary, secondary, expanded));
        island.setScene(s, main, mainAt, splitChanged, split, splitAt, firstFrame);
        placement = "window " + window.toShortString() + " · " + anchor + " · via " + cutoutSource;
        Log.i(LiveUpdates.TAG, name + " island " + (expanded ? "expanded" : primary.kind) + " " + placement);
    }

    @Override
    public void onIslandTap() {
        NotchOverlays.setExpanded(true);
    }

    @Override
    public void onOutsideTap() {
        if (NotchOverlays.expanded) NotchOverlays.setExpanded(false);
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
        lp.setTitle("RPM notch lab (" + name + ")");
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
            Log.w(LiveUpdates.TAG, name + " " + placement);
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

    private static String valueFor(Item item) {
        if (item.kind == Kind.WATER) return LiveUpdates.glasses + "/" + LiveUpdates.WATER_GOAL;
        return item.text;
    }

    private static NotchContent.Row[] rows(Item primary) {
        NotchContent.Row water = new NotchContent.Row(Kind.WATER, "Water", LiveUpdates.glasses + " of " + LiveUpdates.WATER_GOAL);
        NotchContent.Row nudge = water;
        if (primary != null && primary.kind == Kind.MEAL) nudge = new NotchContent.Row(Kind.MEAL, "Lunch not logged", "Log it");
        if (primary != null && primary.kind == Kind.AGENT) nudge = new NotchContent.Row(Kind.AGENT, primary.text, "Undo");
        return new NotchContent.Row[]{
                new NotchContent.Row(Kind.TASK, "Call Prof. Rao", "4:00 PM"),
                new NotchContent.Row(Kind.TASK, "Gym", "7:00 PM"),
                nudge,
        };
    }

    private static String rowsKey(Item primary) {
        return (primary == null ? "none" : primary.kind.name()) + ":" + LiveUpdates.glasses;
    }

    private static String describe(Item primary, Item secondary, boolean expanded) {
        if (expanded) return "Notch panel. Tap outside to close.";
        String what;
        switch (primary.kind) {
            case WATER: what = "Water, " + LiveUpdates.glasses + " of " + LiveUpdates.WATER_GOAL + " glasses"; break;
            case MEAL: what = "Lunch not logged"; break;
            case AGENT: what = "Agent: " + primary.text; break;
            default: what = "Write RM essay, " + primary.text + " left"; break;
        }
        return what + (secondary == null ? "" : ". Also " + secondary.kind.name().toLowerCase(Locale.ROOT)) + ". Tap to open.";
    }

    private NotchAnchor anchor() {
        Rect hole = topCutout();
        float density = context.getResources().getDisplayMetrics().density;
        if (hole == null) return NotchAnchor.fallback(displayWidth(), density);
        return NotchAnchor.fromCutout(hole.left, hole.top, hole.right, hole.bottom, density);
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

    static String cutoutDescription(Context context) {
        NotchPill probe = new NotchPill(context, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, "probe");
        return "Anchor: " + probe.anchor() + " · via " + probe.cutoutSource;
    }
}

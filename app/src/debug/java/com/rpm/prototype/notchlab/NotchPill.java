package com.rpm.prototype.notchlab;

import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.text.TextUtils;
import android.util.Log;
import android.util.TypedValue;
import android.view.Display;
import android.view.DisplayCutout;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.List;

/** Approach B: one overlay window shaped like a pill around the camera cutout. */
final class NotchPill {
    private static final int TASK_COLOR = Color.BLACK;
    private static final int WATER_COLOR = 0xFF1565C0;

    final String name;
    private final Context context;
    private final WindowManager wm;
    private final int type;
    private LinearLayout root;
    String placement = "not shown";

    NotchPill(Context context, int type, String name) {
        this.context = context;
        this.wm = context.getSystemService(WindowManager.class);
        this.type = type;
        this.name = name;
    }

    boolean isShown() {
        return root != null;
    }

    void hide() {
        if (root != null) {
            wm.removeView(root);
            root = null;
        }
        placement = "not shown";
    }

    void render() {
        hide();
        Rect cutout = cutoutRect(context);
        int displayWidth = displayWidth();
        boolean water = NotchOverlays.mode == NotchOverlays.Mode.WATER;
        boolean expanded = NotchOverlays.expanded;

        int pillHeight = Math.max(cutout.height() + dp(10), dp(34));
        int side = dp(84);
        int gap = cutout.width() + dp(14);
        int width = expanded ? Math.min(displayWidth - dp(24), dp(420)) : side * 2 + gap;
        int x = Math.max(0, Math.min(cutout.centerX() - width / 2, displayWidth - width));
        int y = Math.max(0, cutout.centerY() - pillHeight / 2);

        root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(water ? WATER_COLOR : TASK_COLOR);
        bg.setCornerRadius(expanded ? dp(28) : pillHeight / 2f);
        root.setBackground(bg);
        root.setPadding(dp(14), 0, dp(14), expanded ? dp(14) : 0);

        LinearLayout header = new LinearLayout(context);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView left = label(water ? "Water" : "Write RM essay", 14, Gravity.END | Gravity.CENTER_VERTICAL);
        TextView right = label(water ? LiveUpdates.glasses + "/" + LiveUpdates.WATER_GOAL : "25m", 14, Gravity.START | Gravity.CENTER_VERTICAL);
        right.setTextColor(water ? Color.WHITE : 0xFFB39DFF);
        header.addView(left, new LinearLayout.LayoutParams(0, pillHeight, 1));
        header.addView(new View(context), new LinearLayout.LayoutParams(gap, pillHeight));
        header.addView(right, new LinearLayout.LayoutParams(0, pillHeight, 1));
        root.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, pillHeight));
        header.setContentDescription(water ? "Water " + LiveUpdates.glasses + " of 8. Tap to expand." : "Write RM essay, 25 minutes left. Tap to expand.");
        header.setOnClickListener(v -> NotchOverlays.setExpanded(!NotchOverlays.expanded));

        if (expanded) addPanel(water);

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                        | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.x = x;
        lp.y = y;
        lp.setTitle("RPM notch lab (" + name + ")");
        if (Build.VERSION.SDK_INT >= 30) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            lp.setFitInsetsTypes(0);
        } else if (Build.VERSION.SDK_INT >= 28) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        root.setOnTouchListener((v, e) -> {
            if (e.getActionMasked() == MotionEvent.ACTION_OUTSIDE && NotchOverlays.expanded) {
                NotchOverlays.setExpanded(false);
                return true;
            }
            return false;
        });
        LinearLayout shown = root;
        shown.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
            int[] at = new int[2];
            v.getLocationOnScreen(at);
            placement = "asked x=" + x + " y=" + y + " · actual x=" + at[0] + " y=" + at[1] + " " + v.getWidth() + "x" + v.getHeight()
                    + " · cutout " + cutout.toShortString();
            Log.i(LiveUpdates.TAG, name + " pill " + placement);
        });
        try {
            wm.addView(root, lp);
        } catch (RuntimeException e) {
            root = null;
            placement = "addView failed: " + e.getClass().getSimpleName() + ": " + e.getMessage();
            Log.w(LiveUpdates.TAG, name + " " + placement);
        }
    }

    private void addPanel(boolean water) {
        String[] rows = water
                ? new String[]{"Water " + LiveUpdates.glasses + " of 8 glasses", "Next reminder in 45 min", "Last glass 10:40"}
                : new String[]{"Now · Write RM essay · 25 min left", "Next · Call Prof. Rao · 16:00", "Later · Gym · 18:30"};
        for (String row : rows) {
            TextView t = label(row, 15, Gravity.START | Gravity.CENTER_VERTICAL);
            t.setPadding(dp(4), dp(8), dp(4), dp(8));
            root.addView(t, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        LinearLayout buttons = new LinearLayout(context);
        buttons.setPadding(0, dp(8), 0, 0);
        for (String label : new String[]{"Log a meal", "Quick capture", "Ask agent"}) {
            Button b = new Button(context);
            b.setText(label);
            b.setAllCaps(false);
            b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            b.setTextColor(Color.WHITE);
            GradientDrawable chip = new GradientDrawable();
            chip.setColor(0x33FFFFFF);
            chip.setCornerRadius(dp(18));
            b.setBackground(chip);
            b.setMinHeight(dp(44));
            b.setOnClickListener(v -> Toast.makeText(context, label + " (spike: not wired)", Toast.LENGTH_SHORT).show());
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(44), 1);
            p.setMargins(dp(3), 0, dp(3), 0);
            buttons.addView(b, p);
        }
        root.addView(buttons, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private TextView label(String text, int sp, int gravity) {
        TextView t = new TextView(context);
        t.setText(text);
        t.setTextColor(Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setGravity(gravity);
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        return t;
    }

    private int displayWidth() {
        if (Build.VERSION.SDK_INT >= 30) return wm.getMaximumWindowMetrics().getBounds().width();
        return context.getResources().getDisplayMetrics().widthPixels;
    }

    private int dp(int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    /** Top cutout of the default display, or a centred stand-in when the display reports none. */
    static Rect cutoutRect(Context context) {
        if (Build.VERSION.SDK_INT >= 29) {
            Display display = context.getSystemService(DisplayManager.class).getDisplay(Display.DEFAULT_DISPLAY);
            DisplayCutout cutout = display == null ? null : display.getCutout();
            if (cutout != null) {
                List<Rect> rects = cutout.getBoundingRects();
                Rect top = null;
                for (Rect r : rects) if (top == null || r.top < top.top) top = r;
                if (top != null && !top.isEmpty()) return top;
            }
        }
        float density = context.getResources().getDisplayMetrics().density;
        int w = context.getResources().getDisplayMetrics().widthPixels;
        int h = Math.round(24 * density);
        return new Rect(w / 2, Math.round(4 * density), w / 2, Math.round(4 * density) + h);
    }

    static String cutoutDescription(Context context) {
        if (Build.VERSION.SDK_INT >= 29) {
            Display display = context.getSystemService(DisplayManager.class).getDisplay(Display.DEFAULT_DISPLAY);
            DisplayCutout cutout = display == null ? null : display.getCutout();
            if (cutout != null && !cutout.getBoundingRects().isEmpty()) return "Cutout: " + cutoutRect(context).toShortString();
        }
        return "Cutout: none reported (pill uses top-centre stand-in)";
    }
}

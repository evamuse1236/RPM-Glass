package com.rpm.prototype;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.rpm.prototype.NotchScene.Look;

/** Builds the pill and the open island's content (playground/notch-view.mjs is its copy): pure black, one accent per kind. */
final class NotchContent {
    static final int WHITE_60 = 0x99FFFFFF;
    static final int WHITE_70 = 0xB3FFFFFF;
    static final int WHITE_87 = 0xDEFFFFFF;
    static final int WHITE_12 = 0x1FFFFFFF;
    static final int WATER = 0xFF7CACF8;
    static final int HABIT = 0xFF6DD58C;
    static final int MEAL = 0xFFFDD663;
    static final int TRACK = 0x2EFFFFFF;
    static final int TILE = 0xFF0B57D0;

    interface Actions {
        void done();

        void drink();

        void snooze();

        void logMeal();

        void openPlan();

        void openAlert();

        void snoozeAlert();

        void stopAlert();
    }

    private final Context context;

    NotchContent(Context context) {
        this.context = context;
    }

    static int accent(Look look) {
        switch (look) {
            case WATER: return WATER;
            case HABIT: return HABIT;
            case MEAL: return MEAL;
            default: return WHITE_60;
        }
    }

    static int icon(Look look) {
        switch (look) {
            case EVENT: return R.drawable.notch_ic_event;
            case WATER: return R.drawable.notch_ic_water;
            case HABIT: return R.drawable.notch_ic_routine;
            case MEAL: return R.drawable.notch_ic_meal;
            default: return R.drawable.notch_ic_task;
        }
    }

    private static boolean plain(Look look) {
        return look == Look.TASK || look == Look.EVENT;
    }

    int leadWidth(int pillHeight) {
        return inset(pillHeight) + circle(pillHeight) + dp(8);
    }

    int trailWidth(String value, boolean chip) {
        TextView probe = text(value, 15, Color.WHITE, 600);
        return (int) Math.ceil(probe.getPaint().measureText(value)) + 1 + dp(8) + dp(14) + (chip ? dp(16) : 0);
    }

    /** Collapsed pill: icon in a grey circle left of the camera, the value right of it; a chip for "+10m". */
    View pill(Look look, String value, boolean chip, int pillHeight, int leadWidth, int keep, int trailWidth) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        LinearLayout.LayoutParams circleLp = new LinearLayout.LayoutParams(circle(pillHeight), circle(pillHeight));
        circleLp.setMarginStart(inset(pillHeight));
        circleLp.setMarginEnd(leadWidth - inset(pillHeight) - circle(pillHeight));
        row.addView(iconCircle(look, circle(pillHeight)), circleLp);
        row.addView(new View(context), new LinearLayout.LayoutParams(keep, 1));
        FrameLayout slot = new FrameLayout(context);
        slot.setPadding(dp(8), 0, dp(14), 0);
        TextView text = text(value, 15, plain(look) || chip ? Color.WHITE : accent(look), 600);
        if (chip) {
            text.setBackground(round(TRACK, dp(999)));
            text.setPadding(dp(8), dp(1), dp(8), dp(1));
        }
        slot.addView(text, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END | Gravity.CENTER_VERTICAL));
        row.addView(slot, new LinearLayout.LayoutParams(trailWidth, ViewGroup.LayoutParams.MATCH_PARENT));
        return row;
    }

    /** The split island's second circle. */
    View split(Look look, int pillHeight) {
        FrameLayout box = new FrameLayout(context);
        box.addView(iconCircle(look, circle(pillHeight)), new FrameLayout.LayoutParams(circle(pillHeight), circle(pillHeight), Gravity.CENTER));
        return box;
    }

    /** The open island: hero (tile, title, time), the bar, three labelled controls, then at most two small rows. */
    View panel(int topInset, NotchScene scene, Actions actions) {
        LinearLayout col = new LinearLayout(context);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), topInset, dp(20), dp(14));
        Look look = scene.heroLook;

        LinearLayout hero = new LinearLayout(context);
        hero.setGravity(Gravity.CENTER_VERTICAL);
        FrameLayout tile = new FrameLayout(context);
        tile.setBackground(round(look == Look.HABIT ? 0xFF146C2E : look == Look.EVENT ? 0xFF3C4043 : TILE, dp(12)));
        tile.addView(glyph(icon(look), Color.WHITE), new FrameLayout.LayoutParams(dp(24), dp(24), Gravity.CENTER));
        hero.addView(tile, new LinearLayout.LayoutParams(dp(44), dp(44)));
        LinearLayout words = new LinearLayout(context);
        words.setOrientation(LinearLayout.VERTICAL);
        words.addView(text(scene.heroTitle, 17, Color.WHITE, 600));
        TextView sub = text(scene.heroSubtitle, 14, accent(look), 400);
        sub.setPadding(0, dp(2), 0, 0);
        words.addView(sub);
        LinearLayout.LayoutParams wordsLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        wordsLp.setMarginStart(dp(14));
        hero.addView(words, wordsLp);
        col.addView(hero);

        LinearLayout bar = new LinearLayout(context);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setMinimumHeight(dp(24));
        bar.addView(text(scene.barStart, 12, WHITE_60, 500));
        LinearLayout.LayoutParams trackLp = new LinearLayout.LayoutParams(0, dp(4), 1);
        trackLp.setMargins(dp(12), 0, dp(12), 0);
        bar.addView(new Bar(context, scene.progress, plain(look) ? WHITE_87 : accent(look)), trackLp);
        bar.addView(text(scene.barEnd, 12, WHITE_60, 500));
        bar.setContentDescription(scene.barSpoken);
        LinearLayout.LayoutParams barLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        barLp.topMargin = dp(12);
        col.addView(bar, barLp);

        LinearLayout controls = new LinearLayout(context);
        if (scene.canDrink()) controls.addView(control(R.drawable.notch_ic_water, "Glass", "Log a glass of water", true, actions::drink), cell(false));
        else controls.addView(control(R.drawable.notch_ic_done, "Done", scene.canDone() ? "Done: " + scene.heroTitle : "Done", scene.canDone(), actions::done), cell(false));
        controls.addView(control(R.drawable.notch_ic_snooze, "Snooze", "Snooze " + scene.snoozeMinutes + " minutes", scene.canSnooze(), actions::snooze), cell(true));
        if (scene.meal != null) controls.addView(control(R.drawable.notch_ic_meal, "Log meal", "Log a meal", scene.canLogMeal, actions::logMeal), cell(true));
        else controls.addView(control(R.drawable.ic_open, "Open plan", "Open the plan", true, actions::openPlan), cell(true));
        LinearLayout.LayoutParams controlsLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        controlsLp.topMargin = dp(8);
        col.addView(controls, controlsLp);

        for (int i = 0; i < Math.min(2, scene.rows.size()); i++) {
            LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            if (i == 0) rowLp.topMargin = dp(10);
            col.addView(smallRow(scene.rows.get(i), scene), rowLp);
        }
        return col;
    }

    /** One small row: glyph, title, then dots for water, a ring for an unlogged meal, or the value. */
    private View smallRow(NotchScene.Row r, NotchScene scene) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(40));
        row.addView(glyph(icon(r.look), accent(r.look)), new LinearLayout.LayoutParams(dp(20), dp(20)));
        TextView title = text(r.title, 15, WHITE_87, 400);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        titleLp.setMarginStart(dp(12));
        titleLp.setMarginEnd(dp(12));
        row.addView(title, titleLp);
        if (r.look == Look.WATER && scene.water != null) {
            row.addView(new Dots(context, scene.water.count, scene.water.goal, dp(8), dp(4)));
            TextView count = text(scene.water.count + "/" + scene.water.goal, 14, WATER, 500);
            count.setPadding(dp(12), 0, 0, 0);
            row.addView(count);
        } else if (r.look == Look.MEAL) {
            View ring = new View(context);
            GradientDrawable d = new GradientDrawable();
            d.setShape(GradientDrawable.OVAL);
            d.setStroke(dp(2), 0x80FFFFFF);
            ring.setBackground(d);
            row.addView(ring, new LinearLayout.LayoutParams(dp(16), dp(16)));
        } else if (r.look == Look.HABIT && scene.habit != null) {
            row.addView(text(scene.habit.done + "/" + scene.habit.total, 14, HABIT, 500));
        } else {
            row.addView(text(r.value, 14, WHITE_70, 400));
        }
        row.setContentDescription(r.title + ", " + r.value);
        return row;
    }

    private View control(int icon, String label, String spoken, boolean enabled, Runnable action) {
        LinearLayout target = new LinearLayout(context);
        target.setOrientation(LinearLayout.VERTICAL);
        target.setGravity(Gravity.CENTER);
        target.setMinimumHeight(dp(64));
        target.setPadding(0, dp(8), 0, dp(8));
        target.addView(glyph(icon, Color.WHITE), new LinearLayout.LayoutParams(dp(24), dp(24)));
        TextView name = text(label, 12, WHITE_70, 500);
        name.setPadding(0, dp(4), 0, 0);
        target.addView(name, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        target.setContentDescription(enabled ? spoken : spoken + ", not available now");
        target.setEnabled(enabled);
        target.setAlpha(enabled ? 1f : 0.3f);
        if (enabled) {
            target.setBackground(pressed(dp(16), WHITE_12));
            target.setOnClickListener(v -> NotchController.safely(label, action));
        }
        return target;
    }

    private LinearLayout.LayoutParams cell(boolean gap) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        if (gap) lp.setMarginStart(dp(8));
        return lp;
    }

    /** Tasks and events: white glyph on grey; nudges: accent glyph on a dim accent. */
    View iconCircle(Look look, int size) {
        FrameLayout circle = new FrameLayout(context);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        boolean plain = plain(look);
        bg.setColor(plain ? 0xFF3C3C3C : (accent(look) & 0x00FFFFFF) | 0x3D000000);
        circle.setBackground(bg);
        int glyph = Math.round(size * 0.6f);
        circle.addView(glyph(icon(look), plain ? WHITE_87 : accent(look)), new FrameLayout.LayoutParams(glyph, glyph, Gravity.CENTER));
        return circle;
    }

    ImageView glyph(int icon, int color) {
        ImageView v = new ImageView(context);
        v.setImageResource(icon);
        v.setImageTintList(ColorStateList.valueOf(color));
        v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        return v;
    }

    TextView text(String s, int sp, int color, int weight) {
        TextView t = new TextView(context);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        t.setIncludeFontPadding(false);
        t.setFontFeatureSettings("tnum");
        t.setTypeface(Build.VERSION.SDK_INT >= 28 ? Typeface.create(Typeface.SANS_SERIF, weight, false) : Typeface.create(Typeface.SANS_SERIF, weight >= 600 ? Typeface.BOLD : Typeface.NORMAL));
        return t;
    }

    static GradientDrawable round(int color, float radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        return d;
    }

    /** Clear at rest, {@code pressedColor} while a finger is down. */
    static StateListDrawable pressed(float radius, int pressedColor) {
        StateListDrawable d = new StateListDrawable();
        d.addState(new int[]{android.R.attr.state_pressed}, round(pressedColor, radius));
        d.addState(new int[]{}, round(Color.TRANSPARENT, radius));
        return d;
    }

    private int circle(int pillHeight) {
        return Math.min(pillHeight - dp(8), dp(28));
    }

    private int inset(int pillHeight) {
        return (pillHeight - circle(pillHeight)) / 2;
    }

    int dp(float v) {
        return NotchAnchor.dp(v, context.getResources().getDisplayMetrics().density);
    }

    private static final class Bar extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final float fraction;
        private final int fill;

        Bar(Context context, float fraction, int fill) {
            super(context);
            this.fraction = fraction;
            this.fill = fill;
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float r = getHeight() / 2f;
            paint.setColor(TRACK);
            canvas.drawRoundRect(0, 0, getWidth(), getHeight(), r, r, paint);
            paint.setColor(fill);
            canvas.drawRoundRect(0, 0, Math.max(getHeight(), getWidth() * fraction), getHeight(), r, r, paint);
        }
    }

    /** Water's goal as dots: filled for each glass drunk. */
    private static final class Dots extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int count;
        private final int goal;
        private final int size;
        private final int gap;

        Dots(Context context, int count, int goal, int size, int gap) {
            super(context);
            this.count = count;
            this.goal = Math.max(0, Math.min(goal, 12));
            this.size = size;
            this.gap = gap;
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        }

        @Override
        protected void onMeasure(int w, int h) {
            setMeasuredDimension(Math.max(0, goal * size + (goal - 1) * gap), size);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float r = size / 2f;
            for (int i = 0; i < goal; i++) {
                paint.setColor(i < count ? WATER : TRACK);
                canvas.drawCircle(i * (size + gap) + r, r, r, paint);
            }
        }
    }
}

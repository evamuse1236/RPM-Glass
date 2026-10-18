package com.rpm.prototype;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
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
import com.rpm.prototype.PillPriority.Kind;

/** Builds the views inside the island, in the Atoll / SmartIsland look: pure black, one accent per kind. */
final class NotchContent {
    static final int WHITE_60 = 0x99FFFFFF;
    static final int WHITE_87 = 0xDEFFFFFF;
    static final int WATER = 0xFF7CACF8;
    static final int HABIT = 0xFF6DD58C;
    static final int MEAL = 0xFFFDD663;
    static final int TRACK = 0x2EFFFFFF;
    static final int TILE = 0xFF0B57D0;

    interface Actions {
        void done();

        void snooze();

        void logMeal();

        void askAgent();
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

    /** The look of a pill slot: the current item's (task or event), or the nudge's. */
    static Look look(Kind kind, NotchScene scene) {
        if (kind == Kind.WATER) return Look.WATER;
        if (kind == Kind.HABIT) return Look.HABIT;
        return scene.hero != null && scene.hero.task.fixed ? Look.EVENT : Look.TASK;
    }

    private static boolean plain(Look look) {
        return look == Look.TASK || look == Look.EVENT;
    }

    int leadWidth(int pillHeight) {
        return inset(pillHeight) + circle(pillHeight) + dp(8);
    }

    /** Collapsed pill: icon in a grey circle left of the camera, the value right of it. */
    View pill(Look look, String value, int pillHeight, int leadWidth, int keep, int trailWidth) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams circleLp = new LinearLayout.LayoutParams(circle(pillHeight), circle(pillHeight));
        circleLp.setMarginStart(inset(pillHeight));
        circleLp.setMarginEnd(leadWidth - inset(pillHeight) - circle(pillHeight));
        row.addView(iconCircle(look, circle(pillHeight)), circleLp);
        row.addView(new View(context), new LinearLayout.LayoutParams(keep, 1));
        TextView text = text(value, 15, plain(look) ? Color.WHITE : accent(look), 600);
        text.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        text.setPadding(dp(8), 0, dp(14), 0);
        row.addView(text, new LinearLayout.LayoutParams(trailWidth, ViewGroup.LayoutParams.MATCH_PARENT));
        return row;
    }

    int trailWidth(String value) {
        TextView probe = text(value, 15, Color.WHITE, 600);
        return Math.round(probe.getPaint().measureText(value)) + dp(8) + dp(14);
    }

    /** The split island's second circle. */
    View split(Look look, int pillHeight) {
        FrameLayout box = new FrameLayout(context);
        box.addView(iconCircle(look, circle(pillHeight)), new FrameLayout.LayoutParams(circle(pillHeight), circle(pillHeight), Gravity.CENTER));
        return box;
    }

    /** Expanded panel: one hero row (tile, title, bar, four bare controls), then at most three small rows. */
    View panel(int topInset, NotchScene scene, Actions actions) {
        LinearLayout col = new LinearLayout(context);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), topInset, dp(20), dp(14));
        Look look = scene.heroLook;

        LinearLayout hero = new LinearLayout(context);
        hero.setGravity(Gravity.CENTER_VERTICAL);
        FrameLayout art = new FrameLayout(context);
        art.setBackground(round(look == Look.HABIT ? 0xFF146C2E : look == Look.EVENT ? 0xFF3C4043 : TILE, dp(14)));
        art.addView(glyph(icon(look), Color.WHITE), new FrameLayout.LayoutParams(dp(28), dp(28), Gravity.CENTER));
        hero.addView(art, new LinearLayout.LayoutParams(dp(52), dp(52)));
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
        barLp.topMargin = dp(14);
        col.addView(bar, barLp);

        LinearLayout controls = new LinearLayout(context);
        controls.setGravity(Gravity.CENTER);
        controls.addView(control(R.drawable.notch_ic_done, scene.canDone() ? "Done: " + scene.heroTitle : "Done", scene.canDone(), actions::done), cell());
        controls.addView(control(R.drawable.notch_ic_snooze, "Snooze " + scene.snoozeMinutes + " minutes", scene.canSnooze(), actions::snooze), cell());
        controls.addView(control(R.drawable.notch_ic_meal, "Log a meal", scene.canLogMeal, actions::logMeal), cell());
        controls.addView(control(R.drawable.notch_ic_agent, "Ask agent", true, actions::askAgent), cell());
        LinearLayout.LayoutParams controlsLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56));
        controlsLp.topMargin = dp(6);
        col.addView(controls, controlsLp);

        if (!scene.rows.isEmpty()) {
            View rule = new View(context);
            rule.setBackgroundColor(TRACK);
            LinearLayout.LayoutParams ruleLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(1)));
            ruleLp.setMargins(0, dp(6), 0, dp(4));
            col.addView(rule, ruleLp);
        }
        for (NotchScene.Row r : scene.rows) {
            col.addView(smallRow(r), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        return col;
    }

    private View smallRow(NotchScene.Row r) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(40));
        row.addView(glyph(icon(r.look), accent(r.look)), new LinearLayout.LayoutParams(dp(20), dp(20)));
        TextView title = text(r.title, 15, WHITE_87, 400);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        titleLp.setMarginStart(dp(14));
        titleLp.setMarginEnd(dp(12));
        row.addView(title, titleLp);
        row.addView(text(r.value, 15, accent(r.look), plain(r.look) ? 400 : 500));
        row.setContentDescription(r.title + ", " + r.value);
        return row;
    }

    private View control(int icon, String label, boolean enabled, Runnable action) {
        FrameLayout target = new FrameLayout(context);
        target.addView(glyph(icon, Color.WHITE), new FrameLayout.LayoutParams(dp(28), dp(28), Gravity.CENTER));
        target.setContentDescription(enabled ? label : label + ", not available now");
        target.setEnabled(enabled);
        target.setAlpha(enabled ? 1f : 0.3f);
        if (enabled) target.setOnClickListener(v -> NotchController.safely(label, action));
        return target;
    }

    private LinearLayout.LayoutParams cell() {
        return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
    }

    /** Tasks and events: white glyph on grey; nudges: accent glyph on a dim accent. */
    private View iconCircle(Look look, int size) {
        FrameLayout circle = new FrameLayout(context);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        boolean plain = look == Look.TASK || look == Look.EVENT;
        bg.setColor(plain ? 0xFF3C3C3C : (accent(look) & 0x00FFFFFF) | 0x3D000000);
        circle.setBackground(bg);
        int glyph = Math.round(size * 0.6f);
        circle.addView(glyph(icon(look), plain ? WHITE_87 : accent(look)), new FrameLayout.LayoutParams(glyph, glyph, Gravity.CENTER));
        return circle;
    }

    private ImageView glyph(int icon, int color) {
        ImageView v = new ImageView(context);
        v.setImageResource(icon);
        v.setImageTintList(ColorStateList.valueOf(color));
        v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        return v;
    }

    private TextView text(String s, int sp, int color, int weight) {
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

    private static GradientDrawable round(int color, float radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        return d;
    }

    private int circle(int pillHeight) {
        return Math.min(pillHeight - dp(8), dp(28));
    }

    private int inset(int pillHeight) {
        return (pillHeight - circle(pillHeight)) / 2;
    }

    private int dp(float v) {
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
}

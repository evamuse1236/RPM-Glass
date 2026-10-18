package com.rpm.prototype.notchlab;

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

import com.rpm.prototype.R;
import com.rpm.prototype.notchlab.PillPriority.Kind;

/** Builds the views inside the island, in the Atoll / SmartIsland look: pure black, one accent per kind. */
final class NotchContent {
    static final int WHITE_60 = 0x99FFFFFF;
    static final int WHITE_87 = 0xDEFFFFFF;
    static final int WATER = 0xFF7CACF8;
    static final int MEAL = 0xFFF2A93B;
    static final int AGENT = 0xFFC58AF9;
    static final int TRACK = 0x2EFFFFFF;
    static final int AREA_STUDY = 0xFF0842A0;
    static final int AREA_STUDY_ON = 0xFFD3E3FD;

    interface Actions {
        void done();

        void snoozeWater();

        void logMeal();

        void capture();

        void askAgent();
    }

    static final class Row {
        final Kind kind;
        final String title;
        final String value;

        Row(Kind kind, String title, String value) {
            this.kind = kind;
            this.title = title;
            this.value = value;
        }
    }

    private final Context context;

    NotchContent(Context context) {
        this.context = context;
    }

    static int accent(Kind kind) {
        switch (kind) {
            case WATER: return WATER;
            case MEAL: return MEAL;
            case AGENT: return AGENT;
            default: return WHITE_60;
        }
    }

    static int icon(Kind kind) {
        switch (kind) {
            case WATER: return R.drawable.notch_ic_water;
            case MEAL: return R.drawable.notch_ic_meal;
            case AGENT: return R.drawable.notch_ic_agent;
            default: return R.drawable.notch_ic_task;
        }
    }

    int leadWidth(int pillHeight) {
        return inset(pillHeight) + circle(pillHeight) + dp(8);
    }

    /** Collapsed pill: accent circle left of the camera, the value right of it. */
    View pill(Kind kind, String value, int pillHeight, int leadWidth, int keep, int trailWidth) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams circleLp = new LinearLayout.LayoutParams(circle(pillHeight), circle(pillHeight));
        circleLp.setMarginStart(inset(pillHeight));
        circleLp.setMarginEnd(leadWidth - inset(pillHeight) - circle(pillHeight));
        row.addView(iconCircle(kind, circle(pillHeight)), circleLp);
        row.addView(new View(context), new LinearLayout.LayoutParams(keep, 1));
        TextView text = text(value, 15, kind == Kind.TASK ? Color.WHITE : accent(kind), 600);
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
    View split(Kind kind, int pillHeight) {
        FrameLayout box = new FrameLayout(context);
        box.addView(iconCircle(kind, circle(pillHeight)), new FrameLayout.LayoutParams(circle(pillHeight), circle(pillHeight), Gravity.CENTER));
        return box;
    }

    /** Expanded panel: one hero row (task, bar, bare controls), then at most three small rows. */
    View panel(int topInset, String title, String subtitle, int elapsedMin, int leftMin, Row[] rows, Actions actions) {
        LinearLayout col = new LinearLayout(context);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(20), topInset, dp(20), dp(14));

        LinearLayout hero = new LinearLayout(context);
        hero.setGravity(Gravity.CENTER_VERTICAL);
        FrameLayout art = new FrameLayout(context);
        art.setBackground(round(AREA_STUDY, dp(14)));
        ImageView artIcon = glyph(R.drawable.notch_ic_task, AREA_STUDY_ON);
        art.addView(artIcon, new FrameLayout.LayoutParams(dp(30), dp(30), Gravity.CENTER));
        hero.addView(art, new LinearLayout.LayoutParams(dp(60), dp(60)));
        LinearLayout words = new LinearLayout(context);
        words.setOrientation(LinearLayout.VERTICAL);
        words.addView(text(title, 17, Color.WHITE, 600));
        words.addView(text(subtitle, 14, WHITE_60, 400));
        LinearLayout.LayoutParams wordsLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        wordsLp.setMarginStart(dp(14));
        hero.addView(words, wordsLp);
        col.addView(hero);

        LinearLayout bar = new LinearLayout(context);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(text(elapsedMin + "m", 12, WHITE_60, 500));
        LinearLayout.LayoutParams trackLp = new LinearLayout.LayoutParams(0, dp(4), 1);
        trackLp.setMargins(dp(12), 0, dp(12), 0);
        bar.addView(new Bar(context, elapsedMin / (float) (elapsedMin + leftMin), WHITE_87), trackLp);
        bar.addView(text("-" + leftMin + "m", 12, WHITE_60, 500));
        bar.setContentDescription(elapsedMin + " minutes done, " + leftMin + " minutes left");
        LinearLayout.LayoutParams barLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(24));
        barLp.topMargin = dp(12);
        col.addView(bar, barLp);

        LinearLayout controls = new LinearLayout(context);
        controls.setGravity(Gravity.CENTER);
        controls.addView(control(R.drawable.notch_ic_snooze, 26, "Snooze water", actions::snoozeWater), cell());
        controls.addView(control(R.drawable.notch_ic_meal, 26, "Log a meal", actions::logMeal), cell());
        controls.addView(control(R.drawable.notch_ic_done, 40, "Done: " + title, actions::done), cell());
        controls.addView(control(R.drawable.notch_ic_capture, 26, "Quick capture", actions::capture), cell());
        controls.addView(control(R.drawable.notch_ic_agent, 26, "Ask the agent", actions::askAgent), cell());
        LinearLayout.LayoutParams controlsLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56));
        controlsLp.topMargin = dp(4);
        col.addView(controls, controlsLp);

        for (int i = 0; i < Math.min(3, rows.length); i++) col.addView(smallRow(rows[i]), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(36)));
        return col;
    }

    private View smallRow(Row r) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(glyph(icon(r.kind), accent(r.kind)), new LinearLayout.LayoutParams(dp(18), dp(18)));
        TextView title = text(r.title, 14, WHITE_87, 400);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        titleLp.setMarginStart(dp(12));
        row.addView(title, titleLp);
        row.addView(text(r.value, 13, r.kind == Kind.TASK ? WHITE_60 : accent(r.kind), 500));
        return row;
    }

    private View control(int icon, int sizeDp, String label, Runnable action) {
        FrameLayout target = new FrameLayout(context);
        target.addView(glyph(icon, sizeDp > 30 ? Color.WHITE : WHITE_87), new FrameLayout.LayoutParams(dp(sizeDp), dp(sizeDp), Gravity.CENTER));
        target.setContentDescription(label);
        target.setOnClickListener(v -> NotchOverlays.safely(label, action));
        return target;
    }

    private LinearLayout.LayoutParams cell() {
        return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
    }

    private View iconCircle(Kind kind, int size) {
        FrameLayout circle = new FrameLayout(context);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor((accent(kind) & 0x00FFFFFF) | 0x3D000000);
        circle.setBackground(bg);
        int glyph = Math.round(size * 0.62f);
        circle.addView(glyph(icon(kind), accent(kind) | 0xFF000000), new FrameLayout.LayoutParams(glyph, glyph, Gravity.CENTER));
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
        return Math.min(pillHeight - dp(12), dp(28));
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

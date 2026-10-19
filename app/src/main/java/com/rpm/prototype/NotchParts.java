package com.rpm.prototype;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.InsetDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Build;
import android.text.Layout;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The island's building blocks (playground/notch-parts.mjs is their copy): words, glyphs, the 40dp pill controls with a
 * 48dp touch area, the 44dp rows and the face frame with its 16dp margin. Sizes come from NotchGeometry.
 */
final class NotchParts {
    static final float LARGE_TEXT = 1.3f;
    static final float MAX_TEXT = 1.8f;

    final Context context;
    private final float density;

    NotchParts(Context context) {
        this.context = context;
        density = context.getResources().getDisplayMetrics().density;
    }

    float fontScale() {
        return context.getResources().getConfiguration().fontScale;
    }

    boolean largeText() {
        return fontScale() > LARGE_TEXT;
    }

    int dp(float v) {
        return NotchAnchor.dp(v, density);
    }

    /** The face: a frame the island's size, its column padded 16dp on three sides and below the band on top. */
    FrameLayout face(LinearLayout column) {
        FrameLayout frame = new FrameLayout(context);
        int[] pad = NotchGeometry.facePadding(density);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(pad[0], pad[1], pad[2], pad[3]);
        frame.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return frame;
    }

    /** What a screen reader hears for the band's ring and value; drawn by IslandBand, so this node only speaks. */
    void bandSpeaks(FrameLayout face, String spoken, int trailingDp) {
        View node = new View(context);
        node.setContentDescription(spoken);
        node.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(NotchGeometry.CIRCLE_DP));
        lp.setMargins(dp(NotchGeometry.PAD_DP), dp(NotchGeometry.PAD_DP), dp(NotchGeometry.PAD_DP + trailingDp), 0);
        face.addView(node, lp);
    }

    /**
     * A control in the band's trailing slot (Stop, Undo): its 40dp shape 16dp from the end, centred on the band, in a
     * 48dp touch box. {@code reachEnd} is true when the box also reaches 4dp past the shape's end.
     */
    void bandControl(FrameLayout face, View control, int widthPx, boolean reachEnd) {
        int reach = (dp(NotchGeometry.TOUCH_DP) - dp(NotchGeometry.CONTROL_DP)) / 2;
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(widthPx, dp(NotchGeometry.TOUCH_DP), Gravity.TOP | Gravity.END);
        lp.setMargins(0, dp(NotchGeometry.PAD_DP) - reach, dp(NotchGeometry.PAD_DP) - (reachEnd ? reach : 0), 0);
        lp.setMarginEnd(lp.rightMargin);
        face.addView(control, lp);
    }

    TextView text(String s, float sp, int color, int weight) {
        TextView t = new TextView(context);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        t.setIncludeFontPadding(false);
        t.setFontFeatureSettings("tnum");
        t.setTypeface(typeface(weight));
        return t;
    }

    static Typeface typeface(int weight) {
        return Build.VERSION.SDK_INT >= 28 ? Typeface.create(Typeface.SANS_SERIF, weight, false)
                : Typeface.create(Typeface.SANS_SERIF, weight >= 600 ? Typeface.BOLD : Typeface.NORMAL);
    }

    /** Words that wrap at whole words: up to {@code normal} lines, more at large and max text, never a split word. */
    TextView wrapping(String s, float sp, int color, int weight, int normal) {
        TextView t = text(s, sp, color, weight);
        t.setSingleLine(false);
        t.setMaxLines(fontScale() >= MAX_TEXT ? normal + 2 : largeText() ? normal + 1 : normal);
        t.setBreakStrategy(Layout.BREAK_STRATEGY_SIMPLE);
        t.setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE);
        t.setLineSpacing(0f, 1.15f);
        return t;
    }

    /** The face's title, 17/600 white, two lines (three at large text, four at max). */
    TextView title(String s) {
        return wrapping(s, 17, Color.WHITE, 600, 2);
    }

    /** The line under the title, 14/400 in the accent, 2dp below. */
    TextView line(String s, int color) {
        TextView t = wrapping(s, 14, color, 400, 1);
        t.setPadding(0, dp(2), 0, 0);
        return t;
    }

    ImageView glyph(int icon, int color) {
        ImageView v = new ImageView(context);
        v.setImageResource(icon);
        v.setImageTintList(ColorStateList.valueOf(color));
        v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        return v;
    }

    static GradientDrawable round(int color, float radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        return d;
    }

    static StateListDrawable states(Drawable rest, Drawable pressed) {
        StateListDrawable d = new StateListDrawable();
        d.addState(new int[]{android.R.attr.state_pressed}, pressed);
        d.addState(new int[]{}, rest);
        return d;
    }

    /** Clear at rest, {@code pressedColor} while a finger is down. */
    static StateListDrawable pressed(float radius, int pressedColor) {
        return states(round(Color.TRANSPARENT, radius), round(pressedColor, radius));
    }

    /**
     * A 40dp pill control drawn inside a 48dp touch box: a primary is its accent 30% into black with the label in the
     * accent; a secondary is white 8% with the label in white 70%. Its corner is 20dp (36 less the 16dp inset).
     */
    View pill(int icon, String label, String spoken, int accent, boolean primary, Runnable action) {
        LinearLayout b = new LinearLayout(context);
        b.setGravity(Gravity.CENTER);
        int reach = (dp(NotchGeometry.TOUCH_DP) - dp(NotchGeometry.CONTROL_DP)) / 2;
        float r = dp(NotchGeometry.innerRadius(NotchGeometry.PAD_DP));
        int rest = primary ? NotchInk.intoBlack(accent, NotchInk.PRIMARY_SHARE) : NotchInk.SECONDARY;
        int down = primary ? NotchInk.intoBlack(accent, NotchInk.PRIMARY_SHARE + 0.06f) : NotchInk.PRESS;
        b.setBackground(states(new InsetDrawable(round(rest, r), 0, reach, 0, reach), new InsetDrawable(round(down, r), 0, reach, 0, reach)));
        b.setMinimumHeight(dp(NotchGeometry.TOUCH_DP));
        b.setPadding(dp(16), reach, dp(16), reach);
        int ink = primary ? accent : NotchInk.WHITE_70;
        if (icon != 0) {
            LinearLayout.LayoutParams g = new LinearLayout.LayoutParams(dp(20), dp(20));
            g.setMarginEnd(dp(8));
            b.addView(glyph(icon, ink), g);
        }
        TextView name = wrapping(label, 15, ink, 600, 1);
        name.setGravity(Gravity.CENTER);
        b.addView(name);
        b.setContentDescription(spoken);
        b.setOnClickListener(v -> NotchController.safely(label, action));
        return b;
    }

    /**
     * One control spans the width; two sit side by side with 8dp between them, the primary first. At large text the
     * second drops under the first. The 48dp touch boxes reach 4dp past the pills, so the margins take that back.
     */
    View controls(View... pills) {
        LinearLayout row = new LinearLayout(context);
        boolean stack = pills.length > 1 && largeText();
        row.setOrientation(stack ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        int reach = (dp(NotchGeometry.TOUCH_DP) - dp(NotchGeometry.CONTROL_DP)) / 2;
        for (int i = 0; i < pills.length; i++) {
            LinearLayout.LayoutParams lp = stack
                    ? new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                    : new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
            if (i > 0 && stack) lp.topMargin = dp(NotchGeometry.PAIR_GAP_DP) - 2 * reach;
            if (i > 0 && !stack) lp.setMarginStart(dp(NotchGeometry.PAIR_GAP_DP));
            row.addView(pills[i], lp);
        }
        return row;
    }

    /** Places the controls 16dp under the words; {@code last} gives back the touch reach below them too. */
    LinearLayout.LayoutParams controlsAt(boolean last) {
        int reach = (dp(NotchGeometry.TOUCH_DP) - dp(NotchGeometry.CONTROL_DP)) / 2;
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(NotchGeometry.CONTROLS_GAP_DP) - reach;
        if (last) lp.bottomMargin = -reach;
        return lp;
    }

    /** The rows' column: 12dp under what is above, 8dp past the margin on each side so a pressed row is 8dp from the edge. */
    LinearLayout rows(boolean afterControls) {
        LinearLayout col = new LinearLayout(context);
        col.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        int reach = (dp(NotchGeometry.TOUCH_DP) - dp(NotchGeometry.CONTROL_DP)) / 2;
        lp.topMargin = dp(NotchGeometry.ROWS_GAP_DP) - (afterControls ? reach : 0);
        lp.setMarginStart(-dp(NotchGeometry.ROW_OUTSET_DP));
        lp.setMarginEnd(-dp(NotchGeometry.ROW_OUTSET_DP));
        col.setLayoutParams(lp);
        return col;
    }

    /** A 44dp row, fully round: glyph, title, then the trailing parts. Pressable only with an action. */
    LinearLayout row(int icon, int iconColor, String title, String spoken, Runnable action) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(NotchGeometry.ROW_DP));
        row.setPadding(dp(NotchGeometry.ROW_OUTSET_DP), dp(2), dp(NotchGeometry.ROW_OUTSET_DP), dp(2));
        row.addView(glyph(icon, iconColor), new LinearLayout.LayoutParams(dp(20), dp(20)));
        TextView name = wrapping(title, 15, NotchInk.WHITE_87, 400, 1);
        LinearLayout.LayoutParams nameLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        nameLp.setMarginStart(dp(12));
        row.addView(name, nameLp);
        row.setContentDescription(spoken);
        if (action != null) {
            row.setBackground(pressed(dp(NotchGeometry.ROW_DP) / 2f, NotchInk.PRESS));
            row.setOnClickListener(v -> NotchController.safely(title, action));
        }
        return row;
    }

    /** Adds {@code part} at the row's end, 12dp after what is before it. */
    static void trail(LinearLayout row, View part, int startMargin) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMarginStart(startMargin);
        lp.gravity = Gravity.CENTER_VERTICAL;
        row.addView(part, lp);
    }

    /** A 40dp round button: Done on an alert row, Stop on the alarm. Its corner is 20dp. */
    View circleButton(int fill, int pressedFill, int icon, int tint, String spoken, Runnable action) {
        FrameLayout b = new FrameLayout(context);
        float r = dp(NotchGeometry.innerRadius(NotchGeometry.PAD_DP));
        b.setBackground(states(round(fill, r), round(pressedFill, r)));
        View mark = icon == 0 ? new View(context) : glyph(icon, tint);
        if (icon == 0) mark.setBackground(round(tint, dp(2)));
        int size = icon == 0 ? dp(14) : dp(20);
        b.addView(mark, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        b.setContentDescription(spoken);
        b.setOnClickListener(v -> NotchController.safely(spoken, action));
        return b;
    }

    /** The alert's bell or clock and its time on a dim pill. */
    View alertChip(String alert, String at) {
        NotchScene.Look look = NotchScene.alertLook(alert);
        LinearLayout pill = new LinearLayout(context);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        pill.setPadding(dp(8), dp(4), dp(10), dp(4));
        pill.setBackground(round(NotchInk.TRACK, dp(14)));
        pill.addView(glyph(NotchBand.icon(look), NotchInk.accent(look)), new LinearLayout.LayoutParams(dp(16), dp(16)));
        TextView time = text(at, 13, NotchInk.WHITE_87, 500);
        time.setPadding(dp(4), 0, 0, 0);
        pill.addView(time);
        pill.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        return pill;
    }

    /** "Reminder at 4:00 PM for Group call. Opens its controls." A reminder never says alarm. */
    static String alertSpoken(String alert, String title, String at) {
        return NotchScene.alertName(alert) + " at " + at + " for " + title + ". Opens its controls.";
    }

    /** Water's goal as 7dp dots, 4dp apart: filled for each glass drunk. */
    static final class Dots extends View {
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
                paint.setColor(i < count ? NotchInk.WATER : NotchInk.TRACK);
                canvas.drawCircle(i * (size + gap) + r, r, r, paint);
            }
        }
    }
}

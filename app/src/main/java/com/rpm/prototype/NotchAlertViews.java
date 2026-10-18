package com.rpm.prototype;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** The reminder and ringing-alarm islands (playground/notch-alert.mjs is their copy). */
final class NotchAlertViews {
    static final int BLUE = 0xFF7CACF8;
    static final int ALARM_TINT = 0xFFF2B8B5;
    static final int ALARM_ON_TINT = 0xFF410E0B;
    static final int ALARM_CIRCLE = 0xFF260302;
    static final int GREY_CIRCLE = 0xFF3C3C3C;
    private static final float LARGE_TEXT = 1.3f;

    private final Context context;
    private final NotchContent parts;

    NotchAlertViews(Context context, NotchContent parts) {
        this.context = context;
        this.parts = parts;
    }

    private boolean largeText() {
        return context.getResources().getConfiguration().fontScale > LARGE_TEXT;
    }

    /** Bell, the task's title and "Open ›". The whole island opens the task. */
    View reminder(int topInset, NotchAlert alert, NotchContent.Actions actions) {
        FrameLayout face = new FrameLayout(context);
        face.setPadding(dp(16), topInset, dp(16), dp(8));
        LinearLayout main = new LinearLayout(context);
        main.setGravity(Gravity.CENTER_VERTICAL);
        main.setMinimumHeight(dp(68));
        main.setBackground(NotchContent.pressed(dp(16), 0x14FFFFFF));
        main.setContentDescription(alert.spoken());
        main.setOnClickListener(v -> NotchController.safely("open reminder", actions::openAlert));
        main.addView(circle(GREY_CIRCLE, R.drawable.ic_notification, Color.WHITE), new LinearLayout.LayoutParams(dp(40), dp(40)));
        main.addView(title(alert.title), grow(dp(12), dp(12)));
        LinearLayout open = new LinearLayout(context);
        open.setGravity(Gravity.CENTER_VERTICAL);
        open.addView(parts.text("Open", 14, BLUE, 500));
        LinearLayout.LayoutParams chevron = new LinearLayout.LayoutParams(dp(18), dp(18));
        chevron.setMarginStart(dp(2));
        open.addView(parts.glyph(R.drawable.ic_chevron, BLUE), chevron);
        main.addView(open);
        face.addView(main, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return face;
    }

    /** Pulsing clock, the title over "Ringing · 5:30 PM", then Snooze and Stop. Only the two buttons silence it. */
    View alarm(int topInset, NotchAlert alert, NotchContent.Actions actions) {
        boolean stacked = largeText();
        LinearLayout face = new LinearLayout(context);
        face.setOrientation(stacked ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        face.setGravity(Gravity.CENTER_VERTICAL);
        face.setPadding(dp(16), topInset, dp(16), dp(8));
        face.setClipChildren(false);
        face.setClipToPadding(false);

        LinearLayout words = new LinearLayout(context);
        words.setGravity(Gravity.CENTER_VERTICAL);
        words.setMinimumHeight(dp(72));
        words.setBackground(NotchContent.pressed(dp(16), 0x14FFFFFF));
        words.setContentDescription(alert.spoken());
        words.setOnClickListener(v -> NotchController.safely("open alarm task", actions::openAlert));
        LinearLayout.LayoutParams ringLp = new LinearLayout.LayoutParams(dp(40) + 2 * dp(Ring.PULSE_DP), dp(40) + 2 * dp(Ring.PULSE_DP));
        ringLp.setMargins(-dp(Ring.PULSE_DP), 0, -dp(Ring.PULSE_DP), 0);
        words.addView(new Ring(context, parts, dp(40), dp(Ring.PULSE_DP)), ringLp);
        LinearLayout stack = new LinearLayout(context);
        stack.setOrientation(LinearLayout.VERTICAL);
        stack.addView(title(alert.title));
        TextView line = parts.text(alert.ringing(), 13, ALARM_TINT, 400);
        line.setPadding(0, dp(2), 0, 0);
        stack.addView(line);
        words.addView(stack, grow(dp(12), 0));
        face.addView(words, stacked
                ? new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                : new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        LinearLayout buttons = new LinearLayout(context);
        buttons.addView(roundButton(NotchContent.WHITE_12, 0x3DFFFFFF, R.drawable.notch_ic_snooze, Color.WHITE,
                "Snooze " + alert.title + " for " + NotchAlert.SNOOZE_MINUTES + " minutes", actions::snoozeAlert), new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout.LayoutParams stopLp = new LinearLayout.LayoutParams(dp(48), dp(48));
        stopLp.setMarginStart(dp(8));
        buttons.addView(roundButton(ALARM_TINT, 0xFFD39A97, 0, ALARM_ON_TINT, "Stop the alarm for " + alert.title, actions::stopAlert), stopLp);
        LinearLayout.LayoutParams buttonsLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        if (stacked) {
            buttonsLp.gravity = Gravity.END;
            buttonsLp.bottomMargin = dp(4);
        } else {
            buttonsLp.setMarginStart(dp(8));
        }
        face.addView(buttons, buttonsLp);
        return face;
    }

    private TextView title(String title) {
        TextView t = parts.text(title, 16, Color.WHITE, 600);
        if (largeText()) {
            t.setSingleLine(false);
            t.setMaxLines(2);
        }
        return t;
    }

    private View circle(int fill, int icon, int tint) {
        FrameLayout c = new FrameLayout(context);
        c.setBackground(NotchContent.round(fill, dp(20)));
        c.addView(parts.glyph(icon, tint), new FrameLayout.LayoutParams(dp(22), dp(22), Gravity.CENTER));
        return c;
    }

    /** A 48dp round button. A glyph of 0 draws Stop's square. */
    private View roundButton(int fill, int pressedFill, int icon, int tint, String spoken, Runnable action) {
        FrameLayout b = new FrameLayout(context);
        android.graphics.drawable.StateListDrawable bg = new android.graphics.drawable.StateListDrawable();
        bg.addState(new int[]{android.R.attr.state_pressed}, NotchContent.round(pressedFill, dp(24)));
        bg.addState(new int[]{}, NotchContent.round(fill, dp(24)));
        b.setBackground(bg);
        View glyph = icon == 0 ? new View(context) : parts.glyph(icon, tint);
        if (icon == 0) glyph.setBackground(NotchContent.round(tint, dp(2)));
        int size = icon == 0 ? dp(14) : dp(24);
        b.addView(glyph, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        b.setContentDescription(spoken);
        b.setOnClickListener(v -> NotchController.safely(spoken, action));
        return b;
    }

    private static LinearLayout.LayoutParams grow(int start, int end) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        lp.setMarginStart(start);
        lp.setMarginEnd(end);
        return lp;
    }

    private int dp(float v) {
        return parts.dp(v);
    }

    /** The alarm's clock in a dark red circle with a ring that pulses out every 1.2 s; a still ring under reduced motion. */
    private static final class Ring extends FrameLayout {
        static final int PULSE_DP = 10;
        private static final int RING = 0x59F2B8B5;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int circle;
        private final int pulse;
        private final float stroke;
        private ValueAnimator beat;
        private float phase;

        Ring(Context context, NotchContent parts, int circle, int pulse) {
            super(context);
            this.circle = circle;
            this.pulse = pulse;
            stroke = parts.dp(2);
            setWillNotDraw(false);
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
            addView(parts.glyph(R.drawable.ic_clock, ALARM_TINT), new LayoutParams(parts.dp(22), parts.dp(22), Gravity.CENTER));
        }

        @Override
        protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            if (!ValueAnimator.areAnimatorsEnabled()) return;
            beat = ValueAnimator.ofFloat(0f, 1f);
            beat.setDuration(1200);
            beat.setRepeatCount(ValueAnimator.INFINITE);
            beat.setInterpolator(new android.view.animation.PathInterpolator(0f, 0f, 0.58f, 1f));
            beat.addUpdateListener(a -> {
                phase = (float) a.getAnimatedValue();
                invalidate();
            });
            beat.start();
        }

        @Override
        protected void onDetachedFromWindow() {
            if (beat != null) beat.cancel();
            beat = null;
            super.onDetachedFromWindow();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float cx = getWidth() / 2f, cy = getHeight() / 2f, r = circle / 2f;
            paint.setStyle(Paint.Style.FILL);
            if (beat != null) {
                paint.setColor(Color.argb(Math.round(Color.alpha(RING) * (1f - phase)), 0xF2, 0xB8, 0xB5));
                canvas.drawCircle(cx, cy, r + pulse * phase, paint);
            }
            paint.setColor(ALARM_CIRCLE);
            canvas.drawCircle(cx, cy, r, paint);
            if (beat == null) {
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(stroke);
                paint.setColor(RING);
                canvas.drawCircle(cx, cy, r + stroke / 2f, paint);
            }
        }
    }
}

package com.rpm.prototype;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.rpm.prototype.NotchScene.Look;

/** The receipt island after an in-place change, and the alert controls (playground/notch-change.mjs is their copy). */
final class NotchChangeViews {
    private static final float LARGE_TEXT = 1.3f;

    private final Context context;
    private final NotchContent parts;

    NotchChangeViews(Context context, NotchContent parts) {
        this.context = context;
        this.parts = parts;
    }

    static int markColor(String mark) {
        switch (mark) {
            case "water": return NotchContent.WATER;
            case "alarm": return NotchAlertViews.ALARM_TINT;
            default: return NotchContent.WHITE_87;
        }
    }

    static int markIcon(String mark) {
        switch (mark) {
            case "water": return R.drawable.notch_ic_water;
            case "reminder": return R.drawable.ic_notification;
            case "alarm": return R.drawable.ic_clock;
            case "off": return R.drawable.notch_ic_alert_off;
            default: return R.drawable.ic_check;
        }
    }

    /** The mark (a ring that steps or fills, then its glyph), the title over the detail, and Undo once saved. */
    View receipt(int topInset, NotchReceipt r, NotchContent.Actions actions) {
        LinearLayout face = new LinearLayout(context);
        face.setGravity(Gravity.CENTER_VERTICAL);
        face.setMinimumHeight(topInset + parts.dp(76));
        face.setPadding(parts.dp(16), topInset, parts.dp(12), parts.dp(8));
        face.setContentDescription(r.spoken());
        face.addView(new Mark(context, r, parts), new LinearLayout.LayoutParams(parts.dp(40), parts.dp(40)));
        LinearLayout words = new LinearLayout(context);
        words.setOrientation(LinearLayout.VERTICAL);
        words.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        words.addView(wrapping(parts.text(r.title, 16, Color.WHITE, 600)));
        TextView detail = wrapping(parts.text(r.detail, 13, r.state == NotchReceipt.State.PROBLEM ? NotchAlertViews.ALARM_TINT : NotchContent.WHITE_70, 400));
        detail.setPadding(0, parts.dp(2), 0, 0);
        words.addView(detail);
        LinearLayout.LayoutParams wordsLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        wordsLp.setMarginStart(parts.dp(12));
        wordsLp.setMarginEnd(parts.dp(8));
        face.addView(words, wordsLp);
        if (r.canUndo()) {
            TextView undo = parts.text("Undo", 14, NotchAlertViews.BLUE, 600);
            undo.setGravity(Gravity.CENTER);
            undo.setPadding(parts.dp(16), 0, parts.dp(16), 0);
            undo.setMinWidth(parts.dp(64));
            undo.setBackground(NotchContent.pressed(parts.dp(24), NotchContent.WHITE_12));
            undo.setContentDescription("Undo: " + r.title);
            undo.setOnClickListener(v -> NotchController.safely("Undo", actions::undo));
            face.addView(undo, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, parts.dp(48)));
        }
        return face;
    }

    /** The task and its alert, then Turn off, Reminder or Ringing alarm, Done and Open. Swipe up goes back. */
    View manage(int topInset, NotchFrame.Managed m, NotchContent.Actions actions) {
        LinearLayout col = new LinearLayout(context);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(parts.dp(20), topInset, parts.dp(20), parts.dp(14));
        Look look = NotchScene.alertLook(m.alert);
        LinearLayout head = new LinearLayout(context);
        head.setGravity(Gravity.CENTER_VERTICAL);
        FrameLayout tile = new FrameLayout(context);
        tile.setBackground(NotchContent.round("alarm".equals(m.alert) ? NotchAlertViews.ALARM_CIRCLE : NotchAlertViews.GREY_CIRCLE, parts.dp(12)));
        tile.addView(parts.glyph(NotchContent.icon(look), NotchContent.accent(look)), new FrameLayout.LayoutParams(parts.dp(24), parts.dp(24), Gravity.CENTER));
        head.addView(tile, new LinearLayout.LayoutParams(parts.dp(44), parts.dp(44)));
        LinearLayout words = new LinearLayout(context);
        words.setOrientation(LinearLayout.VERTICAL);
        words.addView(wrapping(parts.text(m.title, 17, Color.WHITE, 600)));
        TextView line = parts.text(m.line(), 14, NotchContent.accent(look), 400);
        line.setPadding(0, parts.dp(2), 0, 0);
        words.addView(line);
        LinearLayout.LayoutParams wordsLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        wordsLp.setMarginStart(parts.dp(14));
        head.addView(words, wordsLp);
        col.addView(head);

        boolean alarm = "alarm".equals(m.alert);
        LinearLayout controls = new LinearLayout(context);
        controls.addView(parts.control(R.drawable.notch_ic_alert_off, "Turn off", "Turn off the alert for " + m.title, true,
                () -> actions.setAlert("off")), cell(false));
        controls.addView(parts.control(alarm ? R.drawable.ic_notification : R.drawable.ic_clock, alarm ? "Reminder" : "Alarm",
                alarm ? "Make it a reminder instead" : "Make it a ringing alarm instead", true, () -> actions.setAlert(alarm ? "reminder" : "alarm")), cell(true));
        controls.addView(parts.control(R.drawable.notch_ic_done, "Done", "Done: " + m.title, true, actions::doneManaged), cell(true));
        controls.addView(parts.control(R.drawable.ic_open, "Open", "Open " + m.title + " in the plan", true, actions::openManaged), cell(true));
        LinearLayout.LayoutParams controlsLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        controlsLp.topMargin = parts.dp(12);
        col.addView(controls, controlsLp);
        return col;
    }

    private LinearLayout.LayoutParams cell(boolean gap) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        if (gap) lp.setMarginStart(parts.dp(4));
        return lp;
    }

    /** At large text a title may take two lines instead of being cut. */
    private TextView wrapping(TextView t) {
        if (context.getResources().getConfiguration().fontScale > LARGE_TEXT) {
            t.setSingleLine(false);
            t.setMaxLines(2);
        }
        return t;
    }

    /**
     * A dim disc with a ring that moves from {@code from} to {@code to} over 450 ms, then the glyph pops in. Timed from the
     * receipt's start, so a redrawn receipt continues where it was; under reduced motion it shows the end at once.
     */
    private static final class Mark extends FrameLayout {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF oval = new RectF();
        private final NotchReceipt r;
        private final int color;
        private final float stroke;
        private final ImageView glyph;
        private ValueAnimator clock;
        private float t = 1f;

        Mark(Context context, NotchReceipt r, NotchContent parts) {
            super(context);
            this.r = r;
            color = markColor(r.mark);
            stroke = parts.dp(3);
            setWillNotDraw(false);
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
            glyph = parts.glyph(markIcon(r.mark), color);
            addView(glyph, new LayoutParams(parts.dp(20), parts.dp(20), Gravity.CENTER));
            settle();
        }

        @Override
        protected void onAttachedToWindow() {
            super.onAttachedToWindow();
            long elapsed = SystemClock.uptimeMillis() - r.startedAt;
            if (!ValueAnimator.areAnimatorsEnabled() || elapsed >= NotchReceipt.MARK_MS) return;
            clock = ValueAnimator.ofFloat(0f, 1f);
            clock.setDuration(NotchReceipt.MARK_MS);
            clock.setInterpolator(new android.view.animation.LinearInterpolator());
            clock.addUpdateListener(a -> {
                t = (float) a.getAnimatedValue();
                settle();
            });
            clock.start();
            clock.setCurrentPlayTime(elapsed);
        }

        @Override
        protected void onDetachedFromWindow() {
            if (clock != null) clock.cancel();
            clock = null;
            super.onDetachedFromWindow();
        }

        /** Ring over the first 450 ms (decelerating), glyph from 60% to full size over the last 250 ms. */
        private void settle() {
            float pop = IslandView.DECELERATE.getInterpolation(Math.max(0f, Math.min(1f, (t * NotchReceipt.MARK_MS - 350f) / 250f)));
            glyph.setScaleX(0.6f + 0.4f * pop);
            glyph.setScaleY(0.6f + 0.4f * pop);
            glyph.setAlpha(0.4f + 0.6f * pop);
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float ring = IslandView.DECELERATE.getInterpolation(Math.min(1f, t * NotchReceipt.MARK_MS / 450f));
            float sweep = r.from + (r.to - r.from) * ring;
            float inset = stroke / 2f;
            oval.set(inset, inset, getWidth() - inset, getHeight() - inset);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor((color & 0x00FFFFFF) | 0x26000000);
            canvas.drawOval(oval, paint);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(stroke);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setColor(NotchContent.TRACK);
            canvas.drawOval(oval, paint);
            paint.setColor(color);
            if (sweep > 0.001f) canvas.drawArc(oval, -90f, 360f * Math.min(1f, sweep), false, paint);
        }
    }
}

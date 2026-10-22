package com.rpm.prototype;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

final class NotchHabitViews {
    private final NotchParts parts;
    private final NotchChangeViews changes;

    NotchHabitViews(NotchContent content, NotchChangeViews changes) {
        this.parts = content.parts;
        this.changes = changes;
    }

    View habit(NotchScene s, int pillHeight, NotchContent.Actions actions) {
        LinearLayout col = new LinearLayout(parts.context);
        FrameLayout face = face(col, pillHeight);
        boolean water = s.topHabit == NotchHabits.Habit.WATER;
        Meter meter = water ? Meter.water(parts.context, s.water.goal, s.water.count, s.water.count, 0L) : Meter.meal(parts.context, s.meals);
        meter.setContentDescription(water ? "Water, " + s.water.count + " of " + s.water.goal + " glasses" : s.habitLine());
        col.addView(meter, meterAt());
        col.addView(centred(parts.wrapping(s.habitLine(), 15, Color.WHITE, 600, 2)), below(12));
        View primary = water
                ? parts.pill(R.drawable.notch_ic_water, "Glass", "Log a glass of water", NotchInk.WATER, true, actions::habitGlass)
                : parts.pill(R.drawable.notch_ic_meal, "Log meal", "Log " + s.mealTitle + " in the planner", NotchInk.MEAL, true, actions::logMeal);
        View later = parts.pill(R.drawable.notch_ic_snooze, "Later", (water ? "Snooze water" : "Snooze " + s.mealTitle) + " for " + s.snoozeMinutes + " minutes",
                water ? NotchInk.WATER : NotchInk.MEAL, false, actions::habitLater);
        col.addView(parts.controls(primary, later), parts.controlsAt(true));
        return face;
    }

    View receipt(NotchReceipt r, int pillHeight, NotchContent.Actions actions) {
        LinearLayout col = new LinearLayout(parts.context);
        FrameLayout face = face(col, pillHeight);
        face.setContentDescription(r.spoken());
        col.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        col.addView(Meter.water(parts.context, r.goal, r.fromCount(), r.toCount(), r.startedAt), meterAt());
        col.addView(centred(parts.wrapping(r.title, 15, Color.WHITE, 600, 1)), below(12));
        TextView detail = centred(parts.wrapping(r.detail, 13, r.state == NotchReceipt.State.PROBLEM ? NotchInk.ALARM : NotchInk.WHITE_70, 400, 2));
        col.addView(detail, below(2));
        View undo = changes.undo(r, actions);
        if (!r.canUndo()) {
            undo.setVisibility(View.INVISIBLE);
            undo.setEnabled(false);
        }
        col.addView(undo, parts.controlsAt(true));
        return face;
    }

    private FrameLayout face(LinearLayout col, int pillHeight) {
        FrameLayout face = parts.face(col);
        int pad = parts.dp(NotchGeometry.PAD_DP);
        col.setPadding(pad, NotchGeometry.habitFaceTop(pillHeight, parts.context.getResources().getDisplayMetrics().density), pad, pad);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        return face;
    }

    private LinearLayout.LayoutParams meterAt() {
        int size = parts.dp(NotchGeometry.METER_DP);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(size, size);
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        return lp;
    }

    private LinearLayout.LayoutParams below(int dp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = parts.dp(dp);
        return lp;
    }

    private static TextView centred(TextView t) {
        t.setGravity(Gravity.CENTER_HORIZONTAL);
        return t;
    }

    static final class Meter extends View {
        private final DropArt art = new DropArt(Tones.DARK);
        private final boolean water;
        private final int goal;
        private final int from;
        private final int to;
        private final long startedAt;
        private final NotchHabits.MealMeter meals;

        private Meter(Context c, boolean water, int goal, int from, int to, long startedAt, NotchHabits.MealMeter meals) {
            super(c);
            this.water = water;
            this.goal = goal;
            this.from = from;
            this.to = to;
            this.startedAt = startedAt;
            this.meals = meals;
        }

        static Meter water(Context c, int goal, int from, int to, long startedAt) {
            return new Meter(c, true, goal, from, to, startedAt, null);
        }

        static Meter meal(Context c, NotchHabits.MealMeter meals) {
            return new Meter(c, false, 0, 0, 0, 0L, meals);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float size = Math.min(getWidth(), getHeight());
            if (!water) {
                art.meal(canvas, getWidth() / 2f, getHeight() / 2f, size, meals.slots.size(), meals.logged);
                return;
            }
            boolean moving = startedAt > 0 && from != to && ValueAnimator.areAnimatorsEnabled();
            long elapsed = moving ? Math.round((SystemClock.uptimeMillis() - startedAt) / Math.max(0.01f, ValueAnimator.getDurationScale())) : GlassTip.MS;
            art.water(canvas, getWidth() / 2f, getHeight() / 2f, size, goal, from, to, GlassTip.at(elapsed));
            if (elapsed < GlassTip.MS) postInvalidateOnAnimation();
        }
    }

    static final class Drops extends View {
        private final DropArt art = new DropArt(Tones.DARK);
        private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint chip = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final NotchFrame frame;
        private final RectF task;
        private final RectF habit;
        private final Drawable icon;
        private final float density;

        Drops(Context c, NotchFrame frame, RectF task, RectF habit, float valuePx) {
            super(c);
            this.frame = frame;
            this.task = task;
            this.habit = habit;
            density = c.getResources().getDisplayMetrics().density;
            icon = frame.taskDrop() ? c.getDrawable(frame.dropIcon()).mutate() : null;
            text.setTypeface(NotchParts.typeface(600));
            text.setFontFeatureSettings("tnum");
            text.setTextSize(valuePx);
            text.setColor(NotchInk.WHITE);
            chip.setColor(NotchInk.TRACK);
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            if (task != null && icon != null) {
                art.capsule(canvas, task, frame.dropTone(Tones.DARK), icon, Tones.DARK.onTone, task.height() * 14f / 22f);
            }
            if (habit == null) return;
            NotchScene s = frame.scene;
            if (frame.note != null) {
                note(canvas);
            } else if (s.topHabit == NotchHabits.Habit.WATER) {
                art.water(canvas, habit.centerX(), habit.centerY(), habit.height(), s.water.goal, s.water.count, s.water.count, GlassTip.still());
            } else if (s.topHabit == NotchHabits.Habit.MEAL) {
                art.meal(canvas, habit.centerX(), habit.centerY(), habit.height(), s.meals.slots.size(), s.meals.logged);
            }
        }

        private void note(Canvas canvas) {
            Paint.FontMetrics fm = text.getFontMetrics();
            float baseline = habit.centerY() - (fm.ascent + fm.descent) / 2f;
            float right = habit.right;
            if (frame.chip()) {
                float pad = 8 * density, r = habit.height() / 2f;
                canvas.drawRoundRect(habit.left, habit.top, habit.right, habit.bottom, r, r, chip);
                right -= pad;
            }
            String value = frame.pillValue();
            canvas.drawText(value, right - text.measureText(value), baseline, text);
        }
    }
}

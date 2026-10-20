package com.rpm.prototype;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.text.format.DateFormat;
import android.util.Log;
import android.util.TypedValue;
import android.widget.RemoteViews;

import org.json.JSONException;
import org.json.JSONObject;

import java.time.ZoneId;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class NextUpWidget extends AppWidgetProvider {
    static final String TAG = "RpmNextUp";
    static final String TICK = "com.rpm.widget.next_up.tick";
    private static final int SHOW = Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP;
    private static final int PENDING = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    static final int COMPACT_BELOW_DP = 156;
    static final long WINDOW_MS = 15_000L;
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();

    static void changed(Context context) {
        Context c = context.getApplicationContext();
        WORKER.execute(() -> refresh(c, null));
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        String action = intent.getAction();
        if (AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action) || TICK.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)) {
            PendingResult result = goAsync();
            Context app = c.getApplicationContext();
            WORKER.execute(() -> {
                try {
                    refresh(app, null);
                } finally {
                    result.finish();
                }
            });
            return;
        }
        super.onReceive(c, intent);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager manager, int id, Bundle options) {
        changed(c);
    }

    @Override
    public void onDisabled(Context c) {
        c.getSystemService(AlarmManager.class).cancel(tick(c));
    }

    static void refresh(Context c, NotchData data) {
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(c);
            int[] ids = manager.getAppWidgetIds(new ComponentName(c, NextUpWidget.class));
            AlarmManager alarms = c.getSystemService(AlarmManager.class);
            if (ids.length == 0) {
                alarms.cancel(tick(c));
                return;
            }
            long now = System.currentTimeMillis();
            NextUp next = NextUp.of(data != null ? data : NotchData.read(c, NotchData.EMPTY), now, ZoneId.systemDefault(), DateFormat.is24HourFormat(c));
            for (int id : ids) manager.updateAppWidget(id, views(c, next, compact(manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0))));
            schedule(c, alarms, Math.max(now + 1000, next.nextChangeAt));
            Log.i(TAG, "next up " + next.key() + " until " + next.nextChangeAt);
        } catch (RuntimeException e) {
            Log.e(TAG, "next up widget not updated", e);
        }
    }

    private static void schedule(Context c, AlarmManager alarms, long at) {
        PendingIntent tick = tick(c);
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) alarms.setExact(AlarmManager.RTC, at, tick);
        else alarms.setWindow(AlarmManager.RTC, at, WINDOW_MS, tick);
    }

    private static PendingIntent tick(Context c) {
        Intent i = new Intent(c, NextUpWidget.class).setAction(TICK);
        return PendingIntent.getBroadcast(c, 20, i, PENDING);
    }

    static boolean compact(int widthDp) {
        return widthDp > 0 && widthDp < COMPACT_BELOW_DP;
    }

    static RemoteViews views(Context c, NextUp next, boolean compact) {
        RemoteViews v = new RemoteViews(c.getPackageName(), compact ? R.layout.widget_next_up_compact : R.layout.widget_next_up);
        float scale = CompanionControls.widgetTextScale(c) / 100f;
        v.setTextViewText(R.id.next_title, next.title);
        v.setTextViewText(R.id.next_when, next.when);
        v.setViewVisibility(R.id.next_when, next.when.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
        v.setTextViewTextSize(R.id.next_when, TypedValue.COMPLEX_UNIT_SP, 12 * scale);
        v.setTextViewTextSize(R.id.next_title, TypedValue.COMPLEX_UNIT_SP, 15 * scale);
        for (Tones tones : new Tones[]{Tones.LIGHT, Tones.DARK}) {
            boolean day = tones == Tones.LIGHT;
            v.setImageViewBitmap(day ? R.id.next_capsule : R.id.next_capsule_night, capsule(c, tones, next, compact ? 36 : 40));
            v.setImageViewBitmap(day ? R.id.next_ring : R.id.next_ring_night, ring(c, tones, next, compact ? 32 : 36));
            v.setImageViewBitmap(day ? R.id.next_water_art : R.id.next_water_art_night, water(c, tones, next, compact ? 34 : 40));
        }
        v.setContentDescription(R.id.next_task, next.spokenTask());
        v.setContentDescription(R.id.next_water, next.spokenWater());
        v.setOnClickPendingIntent(R.id.next_task, PendingIntent.getActivity(c, 21, taskIntent(c, next), PENDING));
        v.setOnClickPendingIntent(R.id.next_water, PendingIntent.getActivity(c, 22, planner(c, target("water", 0), "com.rpm.widget.water"), PENDING));
        v.setOnClickPendingIntent(R.id.next_voice, PendingIntent.getActivity(c, 23, capture(c, "voice"), PENDING));
        v.setOnClickPendingIntent(R.id.next_add, PendingIntent.getActivity(c, 24, capture(c, "capture"), PENDING));
        return v;
    }

    static Intent taskIntent(Context c, NextUp next) {
        return planner(c, target("day", next.taskId), "com.rpm.widget.task");
    }

    private static JSONObject target(String view, long id) {
        JSONObject t = new JSONObject();
        try {
            t.put("view", view);
            if (id > 0) t.put("id", id);
        } catch (JSONException e) {
            Log.w(TAG, "planner target incomplete", e);
        }
        return t;
    }

    private static Intent planner(Context c, JSONObject target, String action) {
        return NotchActions.plannerIntent(c, target, action);
    }

    private static Intent capture(Context c, String source) {
        return new Intent(c, CompanionActivity.class).setAction("com.rpm.widget." + source).addFlags(SHOW);
    }

    private static int px(Context c, float dp) {
        return Math.round(dp * c.getResources().getDisplayMetrics().density);
    }

    private static Bitmap capsule(Context c, Tones tones, NextUp next, int dp) {
        int size = px(c, dp);
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Drawable icon = c.getDrawable(next.icon).mutate();
        int color = next.hasTask && !next.event ? tones.task(next.tone) : tones.neutral;
        new DropArt(tones).capsule(new Canvas(b), new RectF(0, 0, size, size), color, icon, tones.onTone, size / 2);
        return b;
    }

    private static Bitmap ring(Context c, Tones tones, NextUp next, int dp) {
        int size = px(c, dp);
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        if (!next.hasTask) return b;
        int color = next.event ? tones.neutral : tones.task(next.tone);
        new DropArt(tones).countdown(new Canvas(b), size / 2f, size / 2f, size, next.ring, tones.onSurface(12), color);
        return b;
    }

    private static Bitmap water(Context c, Tones tones, NextUp next, int dp) {
        int size = px(c, dp);
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        new DropArt(tones).water(new Canvas(b), size / 2f, size / 2f, size, next.goal, next.glasses, next.glasses, GlassTip.still());
        return b;
    }
}

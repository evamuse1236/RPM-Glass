package com.rpm.prototype;

import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Build;
import android.os.FileObserver;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.text.format.DateFormat;
import android.util.Log;
import android.view.WindowManager;

import com.rpm.prototype.PillPriority.Item;
import com.rpm.prototype.PillPriority.Kind;

import java.io.File;
import java.time.ZoneId;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The one island: reads the planner store when it changes and every minute, and redraws the pill or panel. */
final class NotchController {
    static final String TAG = "RpmNotch";
    private static final String PREFS = "notch";
    private static final String WATER_SNOOZED_UNTIL = "water-snoozed-until";

    final PillPriority priority = new PillPriority();
    boolean expanded;
    private NotchPill pill;
    private StoreObserver observer;
    private NotchData data = NotchData.EMPTY;
    private NotchScene scene;
    private boolean locked;
    private boolean screenOn = true;
    private boolean landscape;
    private boolean registered;
    private static final ExecutorService reader = Executors.newSingleThreadExecutor();
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable emphasisEnd = () -> safely("emphasis end", this::render);
    private final BroadcastReceiver system = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            safely("system " + intent.getAction(), NotchController.this::refreshEnvironment);
        }
    };

    private final Context service;

    NotchController(Context serviceContext) {
        service = serviceContext;
    }

    /** Runs {@code body} so one exception is logged instead of killing the process and the service with it. */
    static void safely(String where, Runnable body) {
        try {
            body.run();
        } catch (RuntimeException e) {
            Log.e(TAG, "notch " + where + " failed", e);
        }
    }

    void attach() {
        detach();
        pill = new NotchPill(service, this, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY);
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        filter.addAction(Intent.ACTION_TIME_TICK);
        filter.addAction(Intent.ACTION_TIME_CHANGED);
        filter.addAction(Intent.ACTION_TIMEZONE_CHANGED);
        if (Build.VERSION.SDK_INT >= 33) service.registerReceiver(system, filter, Context.RECEIVER_NOT_EXPORTED);
        else service.registerReceiver(system, filter);
        registered = true;
        observer = new StoreObserver(service.getFilesDir());
        observer.startWatching();
        reload();
        refreshEnvironment();
    }

    void detach() {
        if (pill != null) pill.hide();
        pill = null;
        if (observer != null) observer.stopWatching();
        observer = null;
        if (registered) service.unregisterReceiver(system);
        registered = false;
        expanded = false;
        handler.removeCallbacks(emphasisEnd);
    }

    /** Reads the store off the main thread, then redraws with it. */
    void reload() {
        if (pill == null) return;
        reader.execute(() -> {
            NotchData next = NotchData.read(service);
            handler.post(() -> safely("data loaded", () -> {
                data = next;
                render();
            }));
        });
    }

    /** Re-reads lock, screen and orientation, then redraws (also the minute tick). */
    void refreshEnvironment() {
        locked = service.getSystemService(KeyguardManager.class).isKeyguardLocked();
        screenOn = service.getSystemService(PowerManager.class).isInteractive();
        landscape = service.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        render();
    }

    void setExpanded(boolean expand) {
        expanded = expand;
        render();
    }

    void render() {
        handler.removeCallbacks(emphasisEnd);
        if (pill == null) return;
        scene = new NotchScene(data, System.currentTimeMillis(), prefs().getLong(WATER_SNOOZED_UNTIL, 0), ZoneId.systemDefault(), DateFormat.is24HourFormat(service));
        long now = SystemClock.uptimeMillis();
        if (scene.hero != null) priority.show(Kind.TASK, scene.pillValue, now);
        else priority.dismiss(Kind.TASK);
        if (scene.waterDue()) priority.show(Kind.WATER, scene.waterValue(), now);
        else priority.dismiss(Kind.WATER);
        Item primary = priority.primary(now);
        if (primary == null) expanded = false;
        if (primary != null && !locked && screenOn && !landscape) pill.show(primary, priority.secondary(now), expanded, scene, ACTIONS);
        else pill.hide();
        long next = priority.nextChangeAt(now);
        if (next != Long.MAX_VALUE) handler.postAtTime(emphasisEnd, next);
    }

    private SharedPreferences prefs() {
        return service.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private final NotchContent.Actions ACTIONS = new NotchContent.Actions() {
        @Override
        public void done() {
            NotchDay.Slot hero = scene == null ? null : scene.hero;
            expanded = false;
            if (hero != null) NotchActions.complete(service, hero);
            render();
        }

        @Override
        public void snoozeWater() {
            prefs().edit().putLong(WATER_SNOOZED_UNTIL, System.currentTimeMillis() + scene.snoozeMinutes * NotchDay.MIN).apply();
            setExpanded(false);
        }

        @Override
        public void logMeal() {
            expanded = false;
            NotchActions.logMeal(service);
            render();
        }

        @Override
        public void capture() {
            expanded = false;
            NotchActions.capture(service);
            render();
        }
    };

    /** companion.json is replaced by AtomicFile (a rename) or rewritten in place; either way the notch re-reads it. */
    private final class StoreObserver extends FileObserver {
        StoreObserver(File dir) {
            super(dir.getPath(), FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO);
        }

        @Override
        public void onEvent(int event, String path) {
            if ("companion.json".equals(path)) reload();
        }
    }
}

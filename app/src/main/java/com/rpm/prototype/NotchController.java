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

import com.rpm.prototype.NotchFrame.Mode;
import com.rpm.prototype.PillPriority.Item;
import com.rpm.prototype.PillPriority.Kind;

import java.io.File;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The one island: reads the planner store when it changes and every few minutes, and redraws the pill, the open island
 * or an alert island. Rendering the same frame twice does nothing, so window events and ticks cost no relayout.
 */
final class NotchController implements NotchPill.Gestures {
    static final String TAG = "RpmNotch";
    private static final String PREFS = "notch";
    private static final String ENABLED = "enabled";
    private static final String SNOOZE = "snooze:";
    private static final long CALENDAR_EVERY_MS = 5 * 60_000L;

    /** The in-app switch, off until the person turns it on in Settings. */
    static boolean enabled(Context c) {
        return prefs(c).getBoolean(ENABLED, false);
    }

    /** Flips the in-app switch and returns the new state. */
    static boolean toggle(Context c) {
        boolean on = !enabled(c);
        prefs(c).edit().putBoolean(ENABLED, on).apply();
        NotchActions.log(c, "notch.setting", on ? "on" : "off", null);
        return on;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    final PillPriority priority = new PillPriority();
    boolean expanded;
    private NotchPill pill;
    private StoreObserver observer;
    private NotchData data = NotchData.EMPTY;
    private NotchScene scene;
    private long readAt;
    private boolean locked;
    private boolean screenOn = true;
    private boolean landscape;
    private boolean registered;
    private static final ExecutorService reader = Executors.newSingleThreadExecutor();
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable emphasisEnd = () -> safely("emphasis end", this::render);
    private final SharedPreferences.OnSharedPreferenceChangeListener prefsChanged =
            (p, key) -> safely("setting changed", ENABLED.equals(key) ? this::reload : this::render);
    private final BroadcastReceiver system = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            safely("system " + intent.getAction(), () -> {
                if (SystemClock.elapsedRealtime() - readAt >= CALENDAR_EVERY_MS) reload();
                refreshEnvironment();
            });
        }
    };

    private final Context service;
    final NotchAlerting alerting;

    NotchController(Context serviceContext) {
        service = serviceContext;
        alerting = new NotchAlerting(serviceContext, this, reader, handler);
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
        register(system, filter);
        alerting.attach();
        registered = true;
        prefs(service).registerOnSharedPreferenceChangeListener(prefsChanged);
        observer = new StoreObserver(service.getFilesDir());
        observer.startWatching();
        NotchActions.log(service, "notch.service", "connected", null);
        reload();
        readEnvironment();
        render();
    }

    void register(BroadcastReceiver receiver, IntentFilter filter) {
        if (Build.VERSION.SDK_INT >= 33) service.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else service.registerReceiver(receiver, filter);
    }

    void detach() {
        if (pill != null) pill.hide();
        pill = null;
        if (observer != null) observer.stopWatching();
        observer = null;
        if (registered) {
            service.unregisterReceiver(system);
            alerting.detach();
            prefs(service).unregisterOnSharedPreferenceChangeListener(prefsChanged);
        }
        registered = false;
        expanded = false;
        handler.removeCallbacks(emphasisEnd);
    }

    /** Reads the store and calendar off the main thread, then redraws with them. */
    void reload() {
        if (pill == null) return;
        readAt = SystemClock.elapsedRealtime();
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
        readEnvironment();
        render();
    }

    /** A window changed somewhere on the phone: redraw only if lock, screen or orientation changed with it. */
    void onWindowEvent() {
        if (readEnvironment()) render();
    }

    private boolean readEnvironment() {
        boolean wasLocked = locked, wasOn = screenOn, wasLandscape = landscape;
        locked = service.getSystemService(KeyguardManager.class).isKeyguardLocked();
        screenOn = service.getSystemService(PowerManager.class).isInteractive();
        landscape = service.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        return locked != wasLocked || screenOn != wasOn || landscape != wasLandscape;
    }

    void setExpanded(boolean expand) {
        if (expand != expanded) NotchActions.log(service, expand ? "notch.expand" : "notch.collapse", "ok", null);
        expanded = expand;
        render();
    }

    void render() {
        handler.removeCallbacks(emphasisEnd);
        if (pill == null) return;
        if (!enabled(service)) {
            expanded = false;
            pill.hide();
            return;
        }
        scene = new NotchScene(data, System.currentTimeMillis(), snoozes(), ZoneId.systemDefault(), DateFormat.is24HourFormat(service));
        long now = SystemClock.uptimeMillis();
        if (scene.hero != null) priority.show(Kind.TASK, scene.pillValue, now);
        else priority.dismiss(Kind.TASK);
        if (scene.waterDue()) priority.show(Kind.WATER, scene.waterValue(), now);
        else priority.dismiss(Kind.WATER);
        if (scene.habit != null) priority.show(Kind.HABIT, NotchScene.habitValue(scene.habit), now);
        else priority.dismiss(Kind.HABIT);
        Item primary = priority.primary(now);
        if (primary == null) expanded = false;
        NotchAlert alert = alerting.alert();
        NotchFrame.Note note = alerting.note();
        Mode mode = alert != null ? (alert.type == NotchAlert.Type.ALARM ? Mode.ALARM : Mode.REMINDER) : expanded ? Mode.OPEN : Mode.PILL;
        boolean something = primary != null || note != null || alert != null;
        if (something && !locked && screenOn && !landscape) pill.show(new NotchFrame(mode, primary, priority.secondary(now), scene, alert, note), actions);
        else pill.hide();
        long next = priority.nextChangeAt(now);
        if (next != Long.MAX_VALUE) handler.postAtTime(emphasisEnd, next);
    }

    @Override
    public void onGesture(Mode mode, IslandGesture.Result result) {
        NotchActions.log(service, "notch.gesture", result.name().toLowerCase(java.util.Locale.ROOT), NotchActions.payload("on", mode.name()));
        switch (mode) {
            case PILL:
                if (result == IslandGesture.Result.TAP || result == IslandGesture.Result.RIGHT || result == IslandGesture.Result.DOWN) setExpanded(true);
                else if (result == IslandGesture.Result.LEFT) snoozePill();
                else if (result == IslandGesture.Result.LONG_PRESS) openHero();
                break;
            case OPEN:
                if (result == IslandGesture.Result.UP) setExpanded(false);
                break;
            case REMINDER:
                if (result == IslandGesture.Result.TAP || result == IslandGesture.Result.RIGHT) actions.openAlert();
                else if (result == IslandGesture.Result.LEFT) actions.snoozeAlert();
                else if (result == IslandGesture.Result.UP) alerting.fold();
                break;
            case ALARM:
                if (result == IslandGesture.Result.TAP || result == IslandGesture.Result.RIGHT) actions.openAlert();
                break;
            default:
                break;
        }
    }

    @Override
    public void onOutsideTap(Mode mode) {
        if (mode == Mode.OPEN) setExpanded(false);
    }

    /** Swipe left on the pill: the island's own Snooze, shown on the pill as "+10m" for 2 s. */
    private void snoozePill() {
        if (scene == null || !scene.canSnooze()) {
            NotchActions.log(service, "notch.snooze", "nothing_due", null);
            return;
        }
        int minutes = scene.snoozeMinutes;
        actions.snooze();
        alerting.showSnoozed(minutes);
    }

    /** Long press on the pill: the current task in the planner, or the day when the pill shows a nudge or an event. */
    private void openHero() {
        NotchDay.Slot hero = scene == null ? null : scene.hero;
        expanded = false;
        NotchActions.openTask(service, hero == null ? 0 : hero.task.id);
        render();
    }

    /** Local snoozes still running, by key (NotchScene.WATER_SNOOZE, NotchScene.routineSnooze). */
    private Map<String, Long> snoozes() {
        Map<String, Long> out = new HashMap<>();
        long now = System.currentTimeMillis();
        for (Map.Entry<String, ?> e : prefs(service).getAll().entrySet()) {
            if (e.getKey().startsWith(SNOOZE) && e.getValue() instanceof Long && (Long) e.getValue() > now) {
                out.put(e.getKey().substring(SNOOZE.length()), (Long) e.getValue());
            }
        }
        return out;
    }

    private final NotchContent.Actions actions = new NotchContent.Actions() {
        @Override
        public void done() {
            NotchDay.Slot hero = scene == null ? null : scene.hero;
            expanded = false;
            if (hero != null && !hero.task.fixed) NotchActions.complete(service, hero);
            render();
        }

        /** Holds the due water and routine nudges here for the snooze time; the planner's own data is untouched. */
        @Override
        public void snooze() {
            long until = System.currentTimeMillis() + scene.snoozeMinutes * NotchDay.MIN;
            SharedPreferences.Editor edit = prefs(service).edit();
            StringBuilder what = new StringBuilder();
            for (Map.Entry<String, ?> e : prefs(service).getAll().entrySet()) {
                if (e.getKey().startsWith(SNOOZE) && !(e.getValue() instanceof Long && (Long) e.getValue() > System.currentTimeMillis())) edit.remove(e.getKey());
            }
            if (scene.waterDue()) {
                edit.putLong(SNOOZE + NotchScene.WATER_SNOOZE, until);
                what.append("water ");
            }
            if (scene.habit != null) {
                edit.putLong(SNOOZE + NotchScene.routineSnooze(scene.habit.routine.id), until);
                what.append("routine");
            }
            expanded = false;
            edit.apply();
            NotchActions.log(service, "notch.snooze", "ok", NotchActions.payload("what", what.toString().trim(), "minutes", scene.snoozeMinutes));
            render();
        }

        @Override
        public void logMeal() {
            expanded = false;
            NotchActions.logMeal(service, scene.meal);
            render();
        }

        @Override
        public void openPlan() {
            expanded = false;
            NotchActions.openTask(service, 0);
            render();
        }

        @Override
        public void openAlert() {
            alerting.openTask();
        }

        @Override
        public void snoozeAlert() {
            alerting.snooze();
        }

        @Override
        public void stopAlert() {
            alerting.stop();
        }
    };

    /** companion.json is replaced by AtomicFile (a rename) or rewritten in place; either way the notch re-reads it. */
    private final class StoreObserver extends FileObserver {
        StoreObserver(File dir) {
            super(dir.getPath(), FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO);
        }

        @Override
        public void onEvent(int event, String path) {
            if ("companion.json".equals(path)) handler.post(() -> safely("store changed", NotchController.this::reload));
        }
    }
}

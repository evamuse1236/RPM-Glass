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

import java.io.File;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The one island: reads the planner store when it changes and every few minutes, and redraws the pill and its two drops,
 * the task or habit island, or an alert island. Rendering the same frame twice does nothing, so window events and ticks
 * cost no relayout.
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

    final IslandState state = new IslandState();
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
    final NotchRunner runner;
    final NotchChanges changes;

    NotchController(Context serviceContext) {
        service = serviceContext;
        alerting = new NotchAlerting(serviceContext, this, reader, handler);
        runner = new NotchRunner(serviceContext);
        changes = new NotchChanges(serviceContext, this, handler, runner);
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
        AlarmHeadsUp.notchCanShow(false);
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
        state.close();
        changes.detach();
        runner.release();
    }

    /** Reads the store and calendar off the main thread, then redraws with them. */
    void reload() {
        if (pill == null) return;
        readAt = SystemClock.elapsedRealtime();
        NotchData last = data;
        reader.execute(() -> {
            NotchData next = NotchData.read(service, last);
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
        if (expand) runner.warm();
        if (expand != state.expanded() || state.habit()) NotchActions.log(service, expand ? "notch.expand" : "notch.collapse", "ok", null);
        state.expand(expand);
        render();
    }

    void openHabit() {
        runner.warm();
        NotchActions.log(service, "notch.habit", "opened", NotchActions.payload("habit", scene == null || scene.topHabit == null ? "" : scene.topHabit.name()));
        state.openHabit();
        render();
    }

    void render() {
        if (pill == null) return;
        if (!enabled(service)) {
            AlarmHeadsUp.notchCanShow(false);
            state.close();
            pill.hide();
            return;
        }
        scene = new NotchScene(data, System.currentTimeMillis(), snoozes(), ZoneId.systemDefault(), DateFormat.is24HourFormat(service));
        if (state.expanded() && scene.hero == null || state.habit() && scene.topHabit == null) state.close();
        NotchAlert alert = alerting.alert();
        NotchFrame.Note note = alerting.note();
        NotchReceipt receipt = changes.receipt();
        boolean showable = IslandState.showable(locked, screenOn, landscape);
        AlarmHeadsUp.notchCanShow(showable);
        if (!showable) state.hidden();
        Mode mode = state.mode(alert, receipt);
        NotchFrame frame = new NotchFrame(mode, scene, alert, note, state.managed(), receipt);
        if ((mode != Mode.PILL || frame.showsPill()) && showable) pill.show(frame, actions);
        else pill.hide();
    }

    @Override
    public void onGesture(Mode mode, IslandGesture.Result result, NotchFrame.Side side) {
        NotchActions.log(service, "notch.gesture", result.name().toLowerCase(java.util.Locale.ROOT), NotchActions.payload("on", mode.name(), "drop", side.name()));
        switch (mode) {
            case PILL:
                if (result == IslandGesture.Result.TAP || result == IslandGesture.Result.RIGHT || result == IslandGesture.Result.DOWN) openDrop(side);
                else if (result == IslandGesture.Result.LEFT) snoozePill();
                else if (result == IslandGesture.Result.LONG_PRESS) holdDrop(side);
                break;
            case OPEN:
            case HABIT:
                if (result == IslandGesture.Result.UP) setExpanded(false);
                break;
            case MANAGE:
                if (result == IslandGesture.Result.UP) {
                    state.leaveManaged();
                    render();
                }
                break;
            case RECEIPT:
                if (result == IslandGesture.Result.UP) changes.dismiss();
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
        if (mode == Mode.OPEN || mode == Mode.HABIT || mode == Mode.MANAGE) setExpanded(false);
    }

    private void openDrop(NotchFrame.Side side) {
        if (scene == null) return;
        Mode opens = new NotchFrame(Mode.PILL, scene, null, alerting.note()).opens(side);
        if (opens == Mode.HABIT) openHabit();
        else if (opens == Mode.OPEN) setExpanded(true);
    }

    private void holdDrop(NotchFrame.Side side) {
        if (scene == null) return;
        if (new NotchFrame(Mode.PILL, scene, null, alerting.note()).opens(side) != Mode.HABIT) {
            openHero();
            return;
        }
        state.close();
        if (scene.topHabit == NotchHabits.Habit.WATER) NotchActions.openWater(service);
        else NotchActions.logMeal(service, scene.meal);
        render();
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
        state.close();
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
            changes.done(scene == null ? null : scene.hero);
        }

        @Override
        public void drink() {
            if (scene != null) changes.drink(scene.water, false);
        }

        @Override
        public void habitGlass() {
            if (scene != null) changes.drink(scene.water, true);
        }

        @Override
        public void habitLater() {
            if (scene == null || scene.topHabit == null) return;
            String key = scene.topHabit == NotchHabits.Habit.WATER ? NotchScene.WATER_SNOOZE : NotchScene.mealSnooze(scene.meal);
            prefs(service).edit().putLong(SNOOZE + key, System.currentTimeMillis() + scene.snoozeMinutes * NotchDay.MIN).apply();
            NotchActions.log(service, "notch.snooze", "ok", NotchActions.payload("what", scene.topHabit.name().toLowerCase(java.util.Locale.ROOT), "minutes", scene.snoozeMinutes));
            state.close();
            render();
        }

        @Override
        public void doneAlert() {
            alerting.done(changes);
        }

        @Override
        public void manage(NotchDay.Slot slot) {
            if (slot == null || slot.task.alert.isEmpty()) return;
            state.manage(new NotchFrame.Managed(slot, NotchDay.clock(slot.start, ZoneId.systemDefault(), DateFormat.is24HourFormat(service))));
            NotchActions.log(service, "notch.manage_alert", "shown", NotchActions.payload("taskId", slot.task.id, "alert", slot.task.alert));
            render();
        }

        @Override
        public void doneSlot(NotchDay.Slot slot) {
            changes.done(slot);
        }

        @Override
        public void setAlert(String type) {
            if (state.managed() != null) changes.setAlert(state.managed().slot, type);
        }

        @Override
        public void doneManaged() {
            if (state.managed() != null) changes.done(state.managed().slot);
        }

        @Override
        public void openManaged() {
            if (state.managed() == null) return;
            long id = state.managed().slot.task.id;
            state.close();
            NotchActions.openTask(service, id);
            render();
        }

        @Override
        public void undo() {
            changes.undo();
        }

        @Override
        public void openHero() {
            NotchController.this.openHero();
        }

        @Override
        public void snoozeRoutine() {
            if (scene.habit == null) return;
            prefs(service).edit().putLong(SNOOZE + NotchScene.routineSnooze(scene.habit.routine.id),
                    System.currentTimeMillis() + scene.snoozeMinutes * NotchDay.MIN).apply();
            NotchActions.log(service, "notch.snooze", "ok", NotchActions.payload("what", "routine", "minutes", scene.snoozeMinutes));
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
            state.close();
            edit.apply();
            NotchActions.log(service, "notch.snooze", "ok", NotchActions.payload("what", what.toString().trim(), "minutes", scene.snoozeMinutes));
            render();
        }

        @Override
        public void logMeal() {
            state.close();
            NotchActions.logMeal(service, scene.meal);
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

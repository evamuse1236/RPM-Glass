package com.rpm.prototype;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Handler;
import android.text.format.DateFormat;
import android.util.Log;

import org.json.JSONObject;

import java.time.ZoneId;
import java.util.Set;
import java.util.concurrent.ExecutorService;

/**
 * The alert islands and the pill's short notes. A reminder (CompanionAlerts.fired) shows for 6 s and folds back to the
 * pill with its time; a ringing alarm (CompanionAlarmService) stays until Snooze or Stop, or the service's 10-minute stop.
 */
final class NotchAlerting {
    static final String REMINDER_FIRED = "com.rpm.prototype.NOTCH_REMINDER";
    static final long REMINDER_MS = 6_000;
    static final long SNOOZE_NOTE_MS = 2_000;
    static final long REMINDER_NOTE_MS = 8_000;
    static final long ALARM_MS = 10 * 60_000L;

    /** Tells a running notch that a reminder notification was just posted. */
    static void reminderFired(Context c, long id, String title, long at) {
        c.sendBroadcast(new Intent(REMINDER_FIRED).setPackage(c.getPackageName()).putExtra("id", id).putExtra("title", title).putExtra("at", at));
    }

    private final Context service;
    private final NotchController owner;
    private final ExecutorService reader;
    private final Handler handler;
    private NotchAlert alert;
    private NotchFrame.Note note;
    private final Runnable alertEnd = () -> NotchController.safely("alert ends", this::timeUp);
    private final Runnable noteEnd = () -> NotchController.safely("note ends", this::clearNote);
    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            NotchController.safely("alert " + intent.getAction(), () -> {
                if (REMINDER_FIRED.equals(intent.getAction())) {
                    reminder(intent.getLongExtra("id", 0), intent.getStringExtra("title"), intent.getLongExtra("at", System.currentTimeMillis()));
                } else {
                    readAlarm();
                }
            });
        }
    };

    NotchAlerting(Context service, NotchController owner, ExecutorService reader, Handler handler) {
        this.service = service;
        this.owner = owner;
        this.reader = reader;
        this.handler = handler;
    }

    NotchAlert alert() {
        return alert;
    }

    NotchFrame.Note note() {
        return note;
    }

    void attach() {
        IntentFilter filter = new IntentFilter(REMINDER_FIRED);
        filter.addAction(CompanionAlarmService.RING_CHANGED);
        owner.register(receiver, filter);
        readAlarm();
    }

    void detach() {
        service.unregisterReceiver(receiver);
        handler.removeCallbacks(alertEnd);
        handler.removeCallbacks(noteEnd);
        alert = null;
        note = null;
    }

    private void reminder(long id, String title, long at) {
        if (alert != null && alert.type == NotchAlert.Type.ALARM) return;
        show(new NotchAlert(NotchAlert.Type.REMINDER, id, title, at, ZoneId.systemDefault(), DateFormat.is24HourFormat(service)), REMINDER_MS);
    }

    /** Asks the alarm service what rings now: the first ringing alarm shows; none left ends the alarm island. */
    private void readAlarm() {
        Set<Long> ids = CompanionAlarmService.activeIds();
        if (ids.isEmpty()) {
            if (alert != null && alert.type == NotchAlert.Type.ALARM) end();
            return;
        }
        long id = ids.iterator().next();
        if (alert != null && alert.type == NotchAlert.Type.ALARM && alert.taskId == id) return;
        reader.execute(() -> {
            String title = "RPM alarm";
            long at = System.currentTimeMillis();
            try {
                JSONObject d = CompanionStore.read(service);
                JSONObject e = d == null ? null : CompanionAlerts.entry(d, id);
                if (e != null) title = e.optString("title", e.optString("raw", title));
                JSONObject row = CompanionAlerts.ledger(service).optJSONObject(String.valueOf(id));
                if (row != null && row.optLong("at") > 0) at = row.optLong("at");
            } catch (Exception e) {
                Log.w(NotchController.TAG, "alarm details unreadable; island shows a plain title", e);
            }
            String shownTitle = title;
            long shownAt = at;
            handler.post(() -> NotchController.safely("alarm shown", () -> {
                if (!CompanionAlarmService.activeIds().contains(id)) return;
                show(new NotchAlert(NotchAlert.Type.ALARM, id, shownTitle, shownAt, ZoneId.systemDefault(), DateFormat.is24HourFormat(service)), ALARM_MS);
            }));
        });
    }

    private void show(NotchAlert next, long forMs) {
        alert = next;
        owner.expanded = false;
        handler.removeCallbacks(alertEnd);
        handler.postDelayed(alertEnd, forMs);
        NotchActions.log(service, next.type == NotchAlert.Type.ALARM ? "notch.alarm" : "notch.reminder", "shown", NotchActions.payload("taskId", next.taskId));
        owner.render();
    }

    private void timeUp() {
        if (alert == null) return;
        if (alert.type == NotchAlert.Type.REMINDER) fold();
        else end();
    }

    /** The reminder folds back to the pill, which shows the task's time for a while. */
    void fold() {
        if (alert == null) return;
        NotchAlert folded = alert;
        if (folded.type == NotchAlert.Type.REMINDER) setNote(new NotchFrame.Note(folded.at, false, "Next: " + folded.title + " at " + folded.at), REMINDER_NOTE_MS);
        end();
    }

    private void end() {
        alert = null;
        handler.removeCallbacks(alertEnd);
        owner.render();
    }

    void showSnoozed(int minutes) {
        setNote(new NotchFrame.Note("+" + minutes + "m", true, "Snoozed " + minutes + " minutes"), SNOOZE_NOTE_MS);
        owner.render();
    }

    private void clearNote() {
        note = null;
        owner.render();
    }

    private void setNote(NotchFrame.Note next, long forMs) {
        note = next;
        handler.removeCallbacks(noteEnd);
        handler.postDelayed(noteEnd, forMs);
    }

    /** Opens the alert's task in the planner. A reminder is then done; a ringing alarm keeps ringing until answered. */
    void openTask() {
        if (alert == null) return;
        NotchAlert shown = alert;
        NotchActions.openTask(service, shown.taskId);
        if (shown.type == NotchAlert.Type.REMINDER) end();
    }

    /** Snoozes the alert 10 minutes through the same ledger as the notification's Snooze. */
    void snooze() {
        if (alert == null) return;
        NotchAlert shown = alert;
        if (shown.type == NotchAlert.Type.ALARM) {
            CompanionAlarmService.answer(shown.taskId, true);
        } else {
            service.getSystemService(NotificationManager.class).cancel("companion-reminder", (int) shown.taskId);
            reader.execute(() -> {
                try {
                    CompanionAlerts.finish(service, shown.taskId, true, "Reminder snoozed");
                } catch (Exception e) {
                    NotchActions.log(service, "notch.reminder_snooze", "error", NotchActions.payload("error", e.getClass().getSimpleName()));
                }
            });
        }
        NotchActions.log(service, shown.type == NotchAlert.Type.ALARM ? "notch.alarm_snooze" : "notch.reminder_snooze", "ok",
                NotchActions.payload("taskId", shown.taskId, "minutes", NotchAlert.SNOOZE_MINUTES));
        alert = null;
        handler.removeCallbacks(alertEnd);
        showSnoozed(NotchAlert.SNOOZE_MINUTES);
    }

    /**
     * Done: a ringing alarm stops (as Stop does) and a reminder's notification goes away; then the task is ticked in
     * place. Its Undo brings the task back; the alarm stays stopped.
     */
    void done(NotchChanges changes) {
        if (alert == null) return;
        NotchAlert shown = alert;
        if (shown.type == NotchAlert.Type.ALARM) CompanionAlarmService.answer(shown.taskId, false);
        else service.getSystemService(NotificationManager.class).cancel("companion-reminder", (int) shown.taskId);
        NotchActions.log(service, shown.type == NotchAlert.Type.ALARM ? "notch.alarm_done" : "notch.reminder_done", "ok",
                NotchActions.payload("taskId", shown.taskId));
        alert = null;
        handler.removeCallbacks(alertEnd);
        changes.doneAt(shown.taskId, shown.title, shown.when);
    }

    /** Stop: silences the alarm and returns to the pill. */
    void stop() {
        if (alert == null || alert.type != NotchAlert.Type.ALARM) return;
        CompanionAlarmService.answer(alert.taskId, false);
        NotchActions.log(service, "notch.alarm_stop", "ok", NotchActions.payload("taskId", alert.taskId));
        end();
    }
}

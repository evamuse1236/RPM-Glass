package com.rpm.prototype.notchlab;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import com.rpm.prototype.R;

/** Approach A: Android 16 Live Updates (promoted ongoing notifications). */
final class LiveUpdates {
    static final String TAG = "NotchLab";
    private static final String CHANNEL = "notchlab_live";
    static final int TASK_ID = 86001;
    static final int WATER_ID = 86002;
    static final int WATER_GOAL = 8;
    /** Same key AndroidX NotificationCompat writes; Android 16.0 SDK stubs lack the setter. */
    private static final String EXTRA_REQUEST_PROMOTED_ONGOING = "android.requestPromotedOngoing";
    private static final int TASK_TOTAL_MIN = 45;
    private static final int TASK_LEFT_MIN = 25;

    static int glasses = 5;
    static String lastBuild = "none yet";

    private LiveUpdates() {}

    static NotificationManager manager(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Notch lab Live Updates", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setSound(null, null);
        channel.setDescription("Debug-only test notifications for the notch spike.");
        nm.createNotificationChannel(channel);
        return nm;
    }

    static void startTask(Context c) {
        long end = System.currentTimeMillis() + TASK_LEFT_MIN * 60_000L;
        int done = TASK_TOTAL_MIN - TASK_LEFT_MIN;
        Notification.Builder b = base(c, "Write RM essay", TASK_LEFT_MIN + " min left · " + done + " of " + TASK_TOTAL_MIN + " min done")
                .setWhen(end)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setChronometerCountDown(true);
        if (Build.VERSION.SDK_INT >= 36) {
            Notification.ProgressStyle style = new Notification.ProgressStyle()
                    .setStyledByProgress(true)
                    .addProgressSegment(new Notification.ProgressStyle.Segment(TASK_TOTAL_MIN).setColor(0xFF7C4DFF))
                    .setProgress(done);
            b.setStyle(style).setShortCriticalText(TASK_LEFT_MIN + "m");
        } else {
            b.setStyle(new Notification.BigTextStyle().bigText("Next: outline section 2. Tap to open Notch lab."))
                    .setProgress(TASK_TOTAL_MIN, done, false);
        }
        post(c, TASK_ID, b);
    }

    static void startWater(Context c) {
        Notification.Builder b = base(c, "Water " + glasses + "/" + WATER_GOAL, (WATER_GOAL - glasses) + " more glasses today")
                .setStyle(new Notification.BigTextStyle().bigText((WATER_GOAL - glasses) + " more glasses today. Last one about an hour ago."))
                .addAction(action(c, "Drank it", LiveUpdateReceiver.ACTION_DRANK, 1))
                .addAction(action(c, "Snooze 15", LiveUpdateReceiver.ACTION_SNOOZE, 2));
        if (Build.VERSION.SDK_INT >= 36) b.setShortCriticalText(glasses + "/" + WATER_GOAL);
        post(c, WATER_ID, b);
    }

    static void snoozeWater(Context c) {
        manager(c).cancel(WATER_ID);
        PendingIntent again = PendingIntent.getBroadcast(c, 3,
                new Intent(c, LiveUpdateReceiver.class).setAction(LiveUpdateReceiver.ACTION_WATER),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        c.getSystemService(AlarmManager.class).set(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 15 * 60_000L, again);
    }

    static void stop(Context c) {
        NotificationManager nm = manager(c);
        nm.cancel(TASK_ID);
        nm.cancel(WATER_ID);
    }

    /** What the system did with the posted notification: the measured half of the comparison. */
    static String status(Context c) {
        NotificationManager nm = manager(c);
        StringBuilder s = new StringBuilder();
        s.append("Can post promoted: ");
        s.append(Build.VERSION.SDK_INT >= 36 ? (nm.canPostPromotedNotifications() ? "yes" : "NO (user or OS turned it off)") : "n/a (API < 36)");
        s.append("\nLast build: ").append(lastBuild);
        for (StatusBarNotification sbn : nm.getActiveNotifications()) {
            if (sbn.getId() != TASK_ID && sbn.getId() != WATER_ID) continue;
            Notification n = sbn.getNotification();
            s.append("\nActive #").append(sbn.getId() == TASK_ID ? "task" : "water").append(": ");
            if (Build.VERSION.SDK_INT >= 36) {
                boolean promoted = (n.flags & Notification.FLAG_PROMOTED_ONGOING) != 0;
                s.append(promoted ? "PROMOTED (FLAG_PROMOTED_ONGOING set)" : "not promoted (plain ongoing)");
                s.append(", chip text=").append(n.getShortCriticalText());
            } else {
                s.append("ongoing (no Live Updates below API 36)");
            }
        }
        return s.toString();
    }

    private static Notification.Builder base(Context c, String title, String text) {
        Intent open = new Intent(c, NotchLabActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_PROGRESS);
    }

    private static Notification.Action action(Context c, String label, String what, int request) {
        PendingIntent pi = PendingIntent.getBroadcast(c, request, new Intent(c, LiveUpdateReceiver.class).setAction(what),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Action.Builder(null, label, pi).build();
    }

    private static void post(Context c, int id, Notification.Builder b) {
        String path = requestPromotion(b);
        Notification n = b.build();
        String promotable = Build.VERSION.SDK_INT >= 36 ? String.valueOf(n.hasPromotableCharacteristics()) : "n/a";
        lastBuild = (id == TASK_ID ? "task" : "water") + ", request via " + path + ", hasPromotableCharacteristics=" + promotable;
        Log.i(TAG, "post " + lastBuild);
        manager(c).notify(id, n);
    }

    /** Android 16 QPR1+ has a public setter; Android 16.0 reads the same extra. Report which one ran. */
    private static String requestPromotion(Notification.Builder b) {
        Bundle extras = new Bundle();
        extras.putBoolean(EXTRA_REQUEST_PROMOTED_ONGOING, true);
        b.addExtras(extras);
        try {
            Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class).invoke(b, true);
            return "setRequestPromotedOngoing()";
        } catch (ReflectiveOperationException e) {
            return "extra only";
        }
    }
}

package com.rpm.prototype;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.SharedPreferences;
import android.service.notification.StatusBarNotification;

/** Says so in the shade when the notch is on in RPM but Android has RPM Notch off, so it never vanishes silently. */
final class NotchSetup {
    static final String CHANNEL = "rpm_notch_setup";
    static final int ID = 0x4e0c;
    static final long AGAIN_AFTER_MS = 6 * 60 * 60 * 1000L;
    static final String TITLE = "The notch is off in Android";
    static final String TEXT = "Tap, then turn on RPM Notch.";
    static final String DETAIL = "Tap, then turn on RPM Notch under Installed apps. "
            + "If Android greys it out, open RPM's App info, tap the menu, then Allow restricted settings.";
    private static final String LAST_POSTED = "setup_posted_at";

    private NotchSetup() {}

    /** Post when the notch is wanted but Android blocks it, unless it is showing or was posted in the last 6 hours. */
    static boolean shouldPost(boolean notchOn, boolean serviceOn, boolean showing, long lastPosted, long now) {
        return notchOn && !serviceOn && !showing && now - lastPosted >= AGAIN_AFTER_MS;
    }

    static void check(Context c) {
        try {
            NotificationManager n = c.getSystemService(NotificationManager.class);
            boolean notchOn = NotchController.enabled(c);
            boolean serviceOn = NotchAccessibilityService.isOn(c);
            SharedPreferences p = c.getSharedPreferences("notch", Context.MODE_PRIVATE);
            if (!notchOn || serviceOn) {
                n.cancel(ID);
                p.edit().remove(LAST_POSTED).apply();
                return;
            }
            long now = System.currentTimeMillis();
            if (!shouldPost(true, false, showing(n), p.getLong(LAST_POSTED, 0), now)) return;
            if (n.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Notch setup", NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription("Tells you when Android has turned RPM Notch off.");
                n.createNotificationChannel(ch);
            }
            PendingIntent open = PendingIntent.getActivity(c, ID, NotchAccessibilityService.settingsIntent(),
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            n.notify(ID, new Notification.Builder(c, CHANNEL).setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(TITLE).setContentText(TEXT)
                    .setStyle(new Notification.BigTextStyle().bigText(DETAIL))
                    .setContentIntent(open).setOnlyAlertOnce(true).setAutoCancel(true).build());
            p.edit().putLong(LAST_POSTED, now).apply();
        } catch (RuntimeException e) {
            NotchActions.log(c, "notch.setup", "failed", null);
        }
    }

    private static boolean showing(NotificationManager n) {
        for (StatusBarNotification s : n.getActiveNotifications()) if (s.getId() == ID) return true;
        return false;
    }
}

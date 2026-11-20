package com.rpm.prototype;

import android.app.AppOpsManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Process;

/** While the notch steps aside for a payment app, watches which app is in front and turns the notch back on after. */
public final class NotchReturnService extends Service {
    static final String CHANNEL = "rpm_notch_paused";
    static final int ID = 0x4e0d;
    static final String ACTION_RETURN = "com.rpm.prototype.NOTCH_RETURN";
    static final long POLL_MS = 1000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final java.util.Set<String> paymentScreens = new java.util.HashSet<>();
    private String lastResumed;
    private long since;

    static void start(Context c, String pkg) {
        Intent i = new Intent(c, NotchReturnService.class).putExtra("pkg", pkg);
        try {
            c.startForegroundService(i);
        } catch (RuntimeException e) {
            NotchActions.log(c, "notch.step_aside", "watch_failed", NotchActions.payload("error", e.getClass().getSimpleName()));
            c.getSystemService(NotificationManager.class).notify(ID, notice(c, pkg));
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String pkg = NotchStepAside.pausedFor(this);
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, notice(this, pkg), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(ID, notice(this, pkg));
        if (pkg == null || (intent != null && ACTION_RETURN.equals(intent.getAction()))) {
            comeBack("tapped");
            return START_NOT_STICKY;
        }
        if (since == 0) since = System.currentTimeMillis() - 5000;
        handler.removeCallbacks(poll);
        if (hasUsageAccess()) handler.post(poll);
        return START_STICKY;
    }

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            read();
            if (paymentScreens.isEmpty() && NotchStepAside.shouldReturn(lastResumed, getPackageName())) {
                comeBack(lastResumed);
                return;
            }
            handler.postDelayed(this, POLL_MS);
        }
    };

    /** A payment screen counts until it stops, so an unlock prompt drawn over GPay does not bring the notch back. */
    private void read() {
        UsageStatsManager usage = getSystemService(UsageStatsManager.class);
        long now = System.currentTimeMillis();
        UsageEvents events = usage.queryEvents(since, now);
        UsageEvents.Event e = new UsageEvents.Event();
        while (events.getNextEvent(e)) {
            String screen = e.getPackageName() + "/" + e.getClassName();
            boolean payment = NotchStepAside.isPaymentApp(e.getPackageName());
            int type = e.getEventType();
            if (type == UsageEvents.Event.ACTIVITY_RESUMED) {
                lastResumed = e.getPackageName();
                if (payment) paymentScreens.add(screen);
            } else if (type == UsageEvents.Event.ACTIVITY_STOPPED) {
                paymentScreens.remove(screen);
            }
        }
        since = now;
    }

    private void comeBack(String why) {
        handler.removeCallbacks(poll);
        boolean on = NotchStepAside.turnServiceBackOn(this);
        NotchActions.log(this, "notch.step_aside", on ? "returned" : "return_blocked", NotchActions.payload("front", why == null ? "" : why));
        if (on) {
            NotchStepAside.clear(this);
        } else {
            startActivity(NotchAccessibilityService.settingsIntent().addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            NotchStepAside.clear(this);
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private boolean hasUsageAccess() {
        return hasUsageAccess(this);
    }

    static boolean hasUsageAccess(Context c) {
        AppOpsManager ops = c.getSystemService(AppOpsManager.class);
        return ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName()) == AppOpsManager.MODE_ALLOWED;
    }

    /** The paused notice; tapping it or Turn on now brings the notch back at once. */
    static Notification notice(Context c, String pkg) {
        NotificationManager n = c.getSystemService(NotificationManager.class);
        if (n.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Notch paused for payments", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shows while the notch is off so a payment app can work.");
            n.createNotificationChannel(ch);
        }
        String app = label(c, pkg);
        boolean auto = hasUsageAccess(c) && NotchStepAside.canReturnByItself(c);
        PendingIntent back = PendingIntent.getForegroundService(c, ID, new Intent(c, NotchReturnService.class).setAction(ACTION_RETURN),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(c, CHANNEL).setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Notch paused for " + app)
                .setContentText(auto ? "It comes back when you leave " + app + "." : "Tap to turn it back on after you pay.")
                .setContentIntent(back)
                .addAction(new Notification.Action.Builder(null, "Turn on now", back).build())
                .setOngoing(true).setOnlyAlertOnce(true).build();
    }

    private static String label(Context c, String pkg) {
        if (pkg == null) return "payments";
        try {
            return c.getPackageManager().getApplicationLabel(c.getPackageManager().getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) {
            return "payments";
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(poll);
        super.onDestroy();
    }
}

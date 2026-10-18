package com.rpm.prototype.notchlab;

import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;
import android.view.WindowManager;
import android.widget.Toast;

import com.rpm.prototype.notchlab.PillPriority.Item;
import com.rpm.prototype.notchlab.PillPriority.Kind;

/** Shared island state, drawn by up to two windows: the accessibility overlay and the plain app overlay. */
final class NotchOverlays {
    static final PillPriority priority = new PillPriority();
    static boolean expanded;
    private static NotchPill accessibility;
    private static boolean accessibilityWanted = true;
    private static NotchPill plain;
    private static Context environment;
    private static boolean locked;
    private static boolean screenOn = true;
    private static boolean landscape;
    static String lastError = "none";
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static final Runnable expiry = () -> safely("nudge expiry", NotchOverlays::renderAll);
    private static final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            safely("screen " + intent.getAction(), () -> refreshEnvironment(context));
        }
    };

    static {
        priority.post(Kind.TASK, "25m", 0);
    }

    private NotchOverlays() {}

    /** Runs {@code body} so one exception is logged instead of killing the process and the service with it. */
    static void safely(String where, Runnable body) {
        try {
            body.run();
        } catch (RuntimeException e) {
            lastError = where + ": " + e;
            Log.e(LiveUpdates.TAG, "notch " + where + " failed", e);
        }
    }

    static void attachAccessibility(Context serviceContext) {
        detachAccessibility();
        accessibility = new NotchPill(serviceContext, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY, "accessibility");
        environment = serviceContext;
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) serviceContext.registerReceiver(screen, filter, Context.RECEIVER_NOT_EXPORTED);
        else serviceContext.registerReceiver(screen, filter);
        refreshEnvironment(serviceContext);
    }

    static void detachAccessibility() {
        if (accessibility != null) accessibility.hide();
        accessibility = null;
        if (environment != null) {
            try {
                environment.unregisterReceiver(screen);
            } catch (IllegalArgumentException e) {
                Log.w(LiveUpdates.TAG, "screen receiver was not registered", e);
            }
        }
        environment = null;
        handler.removeCallbacks(expiry);
    }

    static boolean accessibilityConnected() {
        return accessibility != null;
    }

    /** Re-reads lock, screen and orientation, then redraws. */
    static void refreshEnvironment(Context context) {
        locked = context.getSystemService(KeyguardManager.class).isKeyguardLocked();
        screenOn = context.getSystemService(PowerManager.class).isInteractive();
        landscape = context.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        renderAll();
    }

    static void post(Kind kind, String text) {
        priority.post(kind, text, SystemClock.uptimeMillis());
        accessibilityWanted = true;
        renderAll();
    }

    static void taskOnly() {
        priority.clearNudges();
        expanded = false;
        accessibilityWanted = true;
        renderAll();
    }

    static void setExpanded(boolean expand) {
        expanded = expand;
        accessibilityWanted = true;
        renderAll();
    }

    static void hideAccessibility() {
        accessibilityWanted = false;
        renderAll();
    }

    /** Returns true when the plain overlay is now shown. */
    static boolean togglePlain(Context context) {
        if (plain != null) {
            plain.hide();
            plain = null;
            return false;
        }
        plain = new NotchPill(context.getApplicationContext(), WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, "plain");
        renderAll();
        return true;
    }

    static void renderAll() {
        handler.removeCallbacks(expiry);
        long now = SystemClock.uptimeMillis();
        Item primary = priority.primary(now);
        Item secondary = priority.secondary(now);
        boolean visible = primary != null && !locked && screenOn && !landscape;
        if (accessibility != null) draw(accessibility, visible && accessibilityWanted, primary, secondary);
        if (plain != null) draw(plain, visible, primary, secondary);
        long next = priority.nextChangeAt(now);
        if (next != Long.MAX_VALUE) handler.postAtTime(expiry, next);
    }

    private static void draw(NotchPill pill, boolean visible, Item primary, Item secondary) {
        if (visible) pill.show(primary, secondary, expanded, ACTIONS);
        else pill.hide();
    }

    private static final NotchContent.Actions ACTIONS = new NotchContent.Actions() {
        @Override
        public void done() {
            say("Done: Write RM essay (spike: not saved)");
            setExpanded(false);
        }

        @Override
        public void snoozeWater() {
            priority.dismiss(Kind.WATER);
            if (environment != null) LiveUpdates.snoozeWater(environment);
            say("Water snoozed for 15 min");
            setExpanded(false);
        }

        @Override
        public void logMeal() {
            priority.dismiss(Kind.MEAL);
            say("Log a meal (spike: not wired)");
            setExpanded(false);
        }

        @Override
        public void capture() {
            say("Quick capture (spike: not wired)");
            setExpanded(false);
        }

        @Override
        public void askAgent() {
            expanded = false;
            post(Kind.AGENT, "Moved Gym to 7 PM");
        }
    };

    private static void say(String text) {
        Context c = environment;
        if (c != null) Toast.makeText(c, text, Toast.LENGTH_SHORT).show();
        Log.i(LiveUpdates.TAG, "notch action: " + text);
    }

    static String status() {
        return "Accessibility pill: " + (accessibility == null ? "service not connected" : accessibility.placement)
                + "\nPlain pill: " + (plain == null ? "off" : plain.placement)
                + "\nShowing: " + describe(priority.primary(SystemClock.uptimeMillis())) + (expanded ? ", expanded" : ", collapsed")
                + "\nHidden for: " + (locked ? "lock screen " : "") + (screenOn ? "" : "screen off ") + (landscape ? "landscape" : "")
                + "\nLast caught error: " + lastError;
    }

    private static String describe(Item item) {
        return item == null ? "nothing" : item.kind + " \"" + item.text + "\"";
    }
}

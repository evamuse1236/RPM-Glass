package com.rpm.prototype;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.provider.Settings;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * UPI and bank apps block payments while an accessibility service installed from a file is on.
 * The notch turns its service off when one of them opens and back on once another app is in front.
 */
final class NotchStepAside {
    static final Set<String> PAYMENT_APPS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "com.google.android.apps.nbu.paisa.user",
            "net.one97.paytm",
            "com.phonepe.app",
            "in.org.npci.upiapp",
            "com.dreamplug.androidapp",
            "in.amazon.mShop.android.shopping",
            "com.mobikwik_new",
            "com.freecharge.android",
            "com.sbi.lotusintouch",
            "com.sbi.upi",
            "com.snapwork.hdfc",
            "com.csam.icici.bank.imobile",
            "com.axis.mobile",
            "com.msf.kbank.mobile",
            "com.bankofbaroda.mconnect",
            "com.fss.pnbpsp",
            "com.idfcfirstbank.optimus",
            "com.YesBank",
            "com.infrasofttech.indianbank",
            "com.canarabank.mobility",
            "com.unionbank.ecommerce.mobile.android",
            "com.fampay.in",
            "money.jupiter",
            "com.naviapp",
            "com.whatsapp.w4b.payments")));

    static final String PREFS = "notch";
    static final String PAUSED_FOR = "step_aside_for";

    private NotchStepAside() {}

    static boolean isPaymentApp(String pkg) {
        return pkg != null && PAYMENT_APPS.contains(pkg);
    }

    /** Come back only once a known app other than a payment app, Android's own unlock or RPM's overlay is in front. */
    static boolean shouldReturn(String foreground, String self) {
        if (foreground == null || foreground.isEmpty()) return false;
        if (isPaymentApp(foreground) || foreground.equals(self)) return false;
        return !foreground.equals("com.android.systemui") && !foreground.equals("android");
    }

    /** The enabled-services string with this service added once, keeping every other service. */
    static String withService(String enabled, String self) {
        if (enabled == null || enabled.isEmpty()) return self;
        for (String s : enabled.split(":")) if (s.equalsIgnoreCase(self)) return enabled;
        return enabled + ":" + self;
    }

    static String pausedFor(Context c) {
        return prefs(c).getString(PAUSED_FOR, null);
    }

    static void markPaused(Context c, String pkg) {
        prefs(c).edit().putString(PAUSED_FOR, pkg).commit();
    }

    static void clear(Context c) {
        prefs(c).edit().remove(PAUSED_FOR).commit();
    }

    static boolean canReturnByItself(Context c) {
        return c.checkSelfPermission(android.Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED;
    }

    /** Turns RPM Notch back on in Android. Returns false when RPM may not write that setting. */
    static boolean turnServiceBackOn(Context c) {
        if (!canReturnByItself(c)) return false;
        String self = new ComponentName(c, NotchAccessibilityService.class).flattenToString();
        String enabled = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        try {
            Settings.Secure.putString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, withService(enabled, self));
            Settings.Secure.putInt(c.getContentResolver(), Settings.Secure.ACCESSIBILITY_ENABLED, 1);
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}

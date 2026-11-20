package com.rpm.prototype;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.accessibility.AccessibilityEvent;

/** Exists only to own a TYPE_ACCESSIBILITY_OVERLAY window at the camera. Reads no screen content. */
public final class NotchAccessibilityService extends AccessibilityService {
    /** Whether the person has turned RPM Notch on in Android's accessibility settings. */
    static boolean isOn(Context c) {
        String enabled = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        ComponentName self = new ComponentName(c, NotchAccessibilityService.class);
        TextUtils.SimpleStringSplitter split = new TextUtils.SimpleStringSplitter(':');
        split.setString(enabled);
        for (String s : split) if (self.equals(ComponentName.unflattenFromString(s))) return true;
        return false;
    }

    static Intent settingsIntent() {
        return new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
    }

    private final NotchController notch = new NotchController(this);
    private boolean steppingAside;

    @Override
    protected void onServiceConnected() {
        NotchController.safely("service connected", notch::attach);
        NotchSetup.check(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        CharSequence pkg = event == null ? null : event.getPackageName();
        if (pkg != null && NotchStepAside.isPaymentApp(pkg.toString())) {
            stepAside(pkg.toString());
            return;
        }
        NotchController.safely("accessibility event", notch::onWindowEvent);
    }

    /** Payment apps refuse to pay while this service is on, so it turns itself off until another app is in front. */
    private void stepAside(String pkg) {
        if (steppingAside) return;
        steppingAside = true;
        NotchStepAside.markPaused(this, pkg);
        NotchActions.log(this, "notch.step_aside", "paused", NotchActions.payload("for", pkg));
        NotchReturnService.start(this, pkg);
        NotchController.safely("step aside", notch::detach);
        disableSelf();
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        NotchController.safely("configuration changed", notch::refreshEnvironment);
    }

    @Override
    public boolean onUnbind(Intent intent) {
        NotchController.safely("unbind", notch::detach);
        NotchSetup.check(this);
        return true;
    }

    @Override
    public void onRebind(Intent intent) {
        NotchController.safely("rebind", notch::attach);
    }
}

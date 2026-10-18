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

    @Override
    protected void onServiceConnected() {
        NotchController.safely("service connected", notch::attach);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        NotchController.safely("accessibility event", notch::onWindowEvent);
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
        return true;
    }

    @Override
    public void onRebind(Intent intent) {
        NotchController.safely("rebind", notch::attach);
    }
}

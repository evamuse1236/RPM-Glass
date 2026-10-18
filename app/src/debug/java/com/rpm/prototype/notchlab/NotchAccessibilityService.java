package com.rpm.prototype.notchlab;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.res.Configuration;
import android.view.accessibility.AccessibilityEvent;

/** Exists only to own a TYPE_ACCESSIBILITY_OVERLAY window. Reads no screen content. */
public final class NotchAccessibilityService extends AccessibilityService {
    @Override
    protected void onServiceConnected() {
        NotchOverlays.safely("service connected", () -> NotchOverlays.attachAccessibility(this));
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        NotchOverlays.safely("accessibility event", () -> NotchOverlays.refreshEnvironment(this));
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        NotchOverlays.safely("configuration changed", () -> NotchOverlays.refreshEnvironment(this));
    }

    @Override
    public boolean onUnbind(Intent intent) {
        NotchOverlays.safely("unbind", NotchOverlays::detachAccessibility);
        return true;
    }

    @Override
    public void onRebind(Intent intent) {
        NotchOverlays.safely("rebind", () -> NotchOverlays.attachAccessibility(this));
    }
}

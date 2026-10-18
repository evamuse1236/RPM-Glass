package com.rpm.prototype.notchlab;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.res.Configuration;
import android.view.accessibility.AccessibilityEvent;

/** Exists only to own a TYPE_ACCESSIBILITY_OVERLAY window. Reads no screen content. */
public final class NotchAccessibilityService extends AccessibilityService {
    @Override
    protected void onServiceConnected() {
        NotchOverlays.attachAccessibility(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        NotchOverlays.renderAll();
    }

    @Override
    public boolean onUnbind(Intent intent) {
        NotchOverlays.detachAccessibility();
        return super.onUnbind(intent);
    }
}

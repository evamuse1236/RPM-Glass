package com.rpm.prototype.notchlab;

import android.content.Context;
import android.view.WindowManager;

/** Shared pill state, drawn by up to two windows: the accessibility overlay and the plain app overlay. */
final class NotchOverlays {
    enum Mode { TASK, WATER }

    static Mode mode = Mode.TASK;
    static boolean expanded;
    private static NotchPill accessibility;
    private static boolean accessibilityWanted = true;
    private static NotchPill plain;

    private NotchOverlays() {}

    static void attachAccessibility(Context serviceContext) {
        accessibility = new NotchPill(serviceContext, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY, "accessibility");
        renderAll();
    }

    static void detachAccessibility() {
        if (accessibility != null) accessibility.hide();
        accessibility = null;
    }

    static boolean accessibilityConnected() {
        return accessibility != null;
    }

    static void show(Mode newMode, boolean expand) {
        mode = newMode;
        expanded = expand;
        accessibilityWanted = true;
        renderAll();
    }

    static void setExpanded(boolean expand) {
        expanded = expand;
        renderAll();
    }

    static void hideAccessibility() {
        accessibilityWanted = false;
        if (accessibility != null) accessibility.hide();
    }

    /** Returns true when the plain overlay is now shown. */
    static boolean togglePlain(Context context) {
        if (plain != null) {
            plain.hide();
            plain = null;
            return false;
        }
        plain = new NotchPill(context.getApplicationContext(), WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, "plain");
        plain.render();
        return true;
    }

    static void renderAll() {
        if (accessibility != null && accessibilityWanted) accessibility.render();
        if (plain != null) plain.render();
    }

    static String status() {
        return "Accessibility pill: " + (accessibility == null ? "service not connected" : accessibility.placement)
                + "\nPlain pill: " + (plain == null ? "off" : plain.placement)
                + "\nMode: " + mode + (expanded ? ", expanded" : ", collapsed");
    }
}

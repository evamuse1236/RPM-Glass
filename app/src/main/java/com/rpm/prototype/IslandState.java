package com.rpm.prototype;

import com.rpm.prototype.NotchFrame.Mode;

/**
 * What the person opened: the task island, one alert's controls inside it, or the habit island. Alerts and receipts sit
 * over this. Only a touch opens it, so whatever hides the island (lock, sleep, turning sideways) closes it and it comes
 * back as the pill.
 */
final class IslandState {
    private boolean expanded;
    private boolean habit;
    private NotchFrame.Managed managed;

    boolean expanded() {
        return expanded;
    }

    boolean habit() {
        return habit;
    }

    void openHabit() {
        expand(false);
        habit = true;
    }

    NotchFrame.Managed managed() {
        return managed;
    }

    /** Opens or closes the island; either way the alert controls close. */
    void expand(boolean open) {
        expanded = open;
        habit = false;
        managed = null;
    }

    void manage(NotchFrame.Managed controls) {
        managed = controls;
    }

    /** Back from the alert controls to the island. */
    void leaveManaged() {
        managed = null;
    }

    /** The island folded on its own (an alert, a receipt, nothing left to show, or the phone hid it). */
    void close() {
        expand(false);
    }

    /** The phone cannot show the island now: locked, asleep or sideways. It returns as the pill. */
    void hidden() {
        close();
    }

    /** The face to draw: a ringing alarm or reminder first, then a receipt, then what the person opened. */
    Mode mode(NotchAlert alert, NotchReceipt receipt) {
        if (alert != null) return alert.type == NotchAlert.Type.ALARM ? Mode.ALARM : Mode.REMINDER;
        if (receipt != null) return Mode.RECEIPT;
        if (managed != null) return Mode.MANAGE;
        if (habit) return Mode.HABIT;
        return expanded ? Mode.OPEN : Mode.PILL;
    }

    /** Whether the phone lets the island show at all. */
    static boolean showable(boolean locked, boolean screenOn, boolean landscape) {
        return !locked && screenOn && !landscape;
    }
}

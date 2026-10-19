package com.rpm.prototype;

import com.rpm.prototype.NotchScene.Look;
import com.rpm.prototype.PillPriority.Item;
import com.rpm.prototype.PillPriority.Kind;

/** What the island shows at one moment. Two frames with the same key draw the same pixels, so the second is skipped. */
final class NotchFrame {
    enum Mode { PILL, OPEN, REMINDER, ALARM, MANAGE, RECEIPT }

    /** The alert controls' task occurrence: its title, alert ("alarm" or "reminder") and time on the clock. */
    static final class Managed {
        final NotchDay.Slot slot;
        final String title;
        final String alert;
        final String at;

        Managed(NotchDay.Slot slot, String at) {
            this.slot = slot;
            this.title = slot.task.title;
            this.alert = slot.task.alert;
            this.at = at;
        }

        /** "Reminder · 4:00 PM" or "Ringing alarm · 4:00 PM". */
        String line() {
            return NotchScene.alertName(alert) + " · " + at;
        }

        String key() {
            return slot.task.id + "@" + slot.start + ":" + title + ":" + alert + ":" + at;
        }
    }

    /** A short value the pill shows in place of its own for a moment: "+10m" after a snooze, a reminder's time. */
    static final class Note {
        final String text;
        final boolean chip;
        final String spoken;

        Note(String text, boolean chip, String spoken) {
            this.text = text;
            this.chip = chip;
            this.spoken = spoken;
        }
    }

    final Mode mode;
    /** What the pill leads with; null when only a note or an alert is left to show. */
    final Item primary;
    final Item secondary;
    final NotchScene scene;
    final NotchAlert alert;
    final Note note;
    final Managed managed;
    final NotchReceipt receipt;

    NotchFrame(Mode mode, Item primary, Item secondary, NotchScene scene, NotchAlert alert, Note note) {
        this(mode, primary, secondary, scene, alert, note, null, null);
    }

    NotchFrame(Mode mode, Item primary, Item secondary, NotchScene scene, NotchAlert alert, Note note, Managed managed, NotchReceipt receipt) {
        this.managed = managed;
        this.receipt = receipt;
        this.mode = mode;
        this.primary = primary;
        this.secondary = mode == Mode.PILL ? secondary : null;
        this.scene = scene;
        this.alert = alert;
        this.note = note;
    }

    /** The look of a pill slot: the current item's (task or event), or the nudge's. */
    static Look look(Kind kind, NotchScene scene) {
        if (kind == Kind.WATER) return Look.WATER;
        if (kind == Kind.HABIT) return Look.HABIT;
        return scene.hero != null && scene.hero.task.fixed ? Look.EVENT : Look.TASK;
    }

    Look pillLook() {
        return primary == null ? Look.TASK : look(primary.kind, scene);
    }

    String pillValue() {
        return note != null ? note.text : primary.text;
    }

    boolean chip() {
        return note != null && note.chip;
    }

    /** The split circle's look, or null when there is none. */
    Look splitLook() {
        return secondary == null ? null : look(secondary.kind, scene);
    }

    /** Changes exactly when something on screen changes; {@code place} carries the geometry (anchor, width, text size). */
    String key(String place) {
        String face;
        switch (mode) {
            case OPEN:
                face = "open|" + scene.key();
                break;
            case REMINDER:
            case ALARM:
                face = "alert|" + alert.key();
                break;
            case MANAGE:
                face = "manage|" + managed.key();
                break;
            case RECEIPT:
                face = "receipt|" + receipt.key();
                break;
            default:
                face = "pill|" + pillLook() + "|" + pillValue() + "|" + chip() + "|" + splitLook() + "|" + spoken();
        }
        return face + "|" + place;
    }

    /** What a screen reader says for the pill. */
    String spoken() {
        if (note != null) return note.spoken;
        String also = secondary == null ? "" : ". Also " + spoken(secondary);
        return spoken(primary) + also + ". Opens the island.";
    }

    private String spoken(Item item) {
        if (item.kind == Kind.WATER) return "Water due, " + scene.water.count + " of " + scene.water.goal + " glasses";
        if (item.kind == Kind.HABIT) return scene.habit.routine.name + ", " + scene.habit.done + " of " + scene.habit.total + " steps done";
        return scene.spoken;
    }
}

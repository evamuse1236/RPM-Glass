package com.rpm.prototype;

/** What the island shows at one moment. Two frames with the same key draw the same pixels, so the second is skipped. */
final class NotchFrame {
    enum Mode { PILL, OPEN, HABIT, REMINDER, ALARM, MANAGE, RECEIPT }

    enum Side { TASK, HABIT }

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

        /** "Reminder" or "Ringing alarm": the time is in the band. */
        String line() {
            return NotchScene.alertName(alert);
        }

        /** "Reminder at 4:00 PM", for a screen reader. */
        String spoken() {
            return NotchScene.alertName(alert) + " at " + at;
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
    final NotchScene scene;
    final NotchAlert alert;
    final Note note;
    final Managed managed;
    final NotchReceipt receipt;

    NotchFrame(Mode mode, NotchScene scene, NotchAlert alert, Note note) {
        this(mode, scene, alert, note, null, null);
    }

    NotchFrame(Mode mode, NotchScene scene, NotchAlert alert, Note note, Managed managed, NotchReceipt receipt) {
        this.managed = managed;
        this.receipt = receipt;
        this.mode = mode;
        this.scene = scene;
        this.alert = alert;
        this.note = note;
    }

    boolean taskDrop() {
        return scene.hero != null;
    }

    boolean habitDrop() {
        return note == null && scene.topHabit != null;
    }

    boolean showsPill() {
        return taskDrop() || habitDrop() || note != null;
    }

    Mode opens(Side side) {
        if (side == Side.HABIT && scene.topHabit != null) return Mode.HABIT;
        if (taskDrop()) return Mode.OPEN;
        return scene.topHabit != null ? Mode.HABIT : Mode.PILL;
    }

    String pillValue() {
        return note == null ? "" : note.text;
    }

    boolean chip() {
        return note != null && note.chip;
    }

    String taskKey() {
        if (!taskDrop()) return "-";
        NotchDay.Task t = scene.hero.task;
        return t.id + "@" + scene.hero.start + ":" + dropTone(Tones.DARK) + ":" + dropIcon();
    }

    int dropTone(Tones tones) {
        NotchDay.Task t = scene.hero.task;
        return t.fixed ? tones.neutral : tones.task(t.tone);
    }

    int dropIcon() {
        NotchDay.Task t = scene.hero.task;
        return t.fixed ? TaskSymbol.EVENT_ICON : TaskSymbol.icon(t.title);
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
            case HABIT:
                face = "habit|" + scene.habitKey() + "|" + scene.snoozeMinutes;
                break;
            case MANAGE:
                face = "manage|" + managed.key();
                break;
            case RECEIPT:
                face = "receipt|" + receipt.key();
                break;
            default:
                face = "pill|" + taskKey() + "|" + (habitDrop() ? scene.habitKey() : "-") + "|" + pillValue() + "|" + chip();
        }
        return face + "|" + place;
    }

    String spoken(Side side) {
        if (side == Side.TASK) return taskDrop() ? scene.spoken + ". Opens the island." : "";
        if (note != null) return note.spoken;
        if (scene.topHabit == NotchHabits.Habit.WATER) return "Water due, " + scene.water.count + " of " + scene.water.goal + " glasses. Opens water.";
        if (scene.topHabit == NotchHabits.Habit.MEAL) return scene.habitLine() + ". Opens the meal.";
        return "";
    }
}

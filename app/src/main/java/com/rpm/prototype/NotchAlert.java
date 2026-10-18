package com.rpm.prototype;

import java.time.ZoneId;

/** A reminder or a ringing alarm the island shows over other apps. A reminder never calls itself an alarm. */
final class NotchAlert {
    enum Type { REMINDER, ALARM }

    static final int SNOOZE_MINUTES = 10;

    final Type type;
    final long taskId;
    final String title;
    /** The alert's time on the clock, "5:30 PM". */
    final String at;

    NotchAlert(Type type, long taskId, String title, long at, ZoneId zone, boolean h24) {
        this.type = type;
        this.taskId = taskId;
        this.title = title == null || title.isEmpty() ? "RPM task" : title;
        this.at = NotchDay.clock(at, zone, h24);
    }

    /** The alarm's second line. */
    String ringing() {
        return "Ringing · " + at;
    }

    String spoken() {
        if (type == Type.ALARM) return "Ringing: " + title + ", " + at + ". Opens the task.";
        return "Reminder: " + title + ", " + at + ". Opens the task.";
    }

    String key() {
        return type + ":" + taskId + ":" + title + ":" + at;
    }
}

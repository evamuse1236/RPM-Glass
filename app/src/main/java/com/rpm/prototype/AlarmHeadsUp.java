package com.rpm.prototype;

/**
 * Whether a ringing alarm's notification pops up. While the notch can show the ringing alarm (attached, on, unlocked,
 * screen on, upright) the notch is the alert: the notification goes to the shade on a quiet channel with no full-screen
 * intent, so no second frame sits under the island. Otherwise, and on the lock screen, it rings as before. The sound is
 * the alarm service's own player, so it plays either way.
 */
final class AlarmHeadsUp {
    private static volatile boolean notchShows;

    private AlarmHeadsUp() {
    }

    static boolean notchShows() {
        return notchShows;
    }

    /** The notch reports whether it can show a ringing alarm now; a change re-posts a ringing alarm's notification. */
    static void notchCanShow(boolean shows) {
        if (shows == notchShows) return;
        notchShows = shows;
        CompanionAlarmService.repost();
    }

    static String channel(boolean notchShows) {
        return notchShows ? CompanionAlerts.ALARMS_QUIET : CompanionAlerts.ALARMS;
    }

    static boolean fullScreen(boolean notchShows) {
        return !notchShows;
    }
}

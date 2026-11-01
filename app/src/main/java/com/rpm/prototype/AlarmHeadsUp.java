package com.rpm.prototype;

/**
 * Where a ringing alarm shows. No alarm ever posts a full-screen intent: the notch is the alarm's screen. While the
 * notch can show it (attached, on, unlocked, screen on, upright) the notification sits in the shade on a quiet channel,
 * so no heads-up frame covers the island. Otherwise (locked, asleep, sideways, notch off) it posts on the high-priority
 * alarm channel: a heads-up and a lock-screen notification with Snooze and Dismiss. The sound is the alarm service's own
 * player, so it rings either way. Both alarm services, planner (CompanionAlarmService) and local (AlarmService), follow it.
 */
final class AlarmHeadsUp {
    private static volatile boolean notchShows;

    private AlarmHeadsUp() {
    }

    static boolean notchShows() {
        return notchShows;
    }

    /** The notch reports whether it can show a ringing alarm now; a change re-posts each ringing alarm's notification. */
    static void notchCanShow(boolean shows) {
        if (shows == notchShows) return;
        notchShows = shows;
        CompanionAlarmService.repost();
        AlarmService.repost();
    }

    static String channel(boolean notchShows) {
        return notchShows ? CompanionAlerts.ALARMS_QUIET : CompanionAlerts.ALARMS;
    }
}

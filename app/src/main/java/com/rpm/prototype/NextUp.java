package com.rpm.prototype;

import java.time.Instant;
import java.time.ZoneId;
import java.util.Collections;

final class NextUp {
    static final long MIN = 60_000L;
    static final long RING_SPAN = 60 * MIN;
    static final String EMPTY_TITLE = "Nothing else timed today";

    final boolean hasTask;
    final long taskId;
    final String title;
    final String when;
    final float ring;
    final int tone;
    final boolean event;
    final int icon;
    final int glasses;
    final int goal;
    final long nextChangeAt;

    private NextUp(boolean hasTask, long taskId, String title, String when, float ring, int tone, boolean event, int icon,
                   int glasses, int goal, long nextChangeAt) {
        this.hasTask = hasTask;
        this.taskId = taskId;
        this.title = title;
        this.when = when;
        this.ring = ring;
        this.tone = tone;
        this.event = event;
        this.icon = icon;
        this.glasses = glasses;
        this.goal = goal;
        this.nextChangeAt = nextChangeAt;
    }

    static NextUp of(NotchData data, long now, ZoneId zone, boolean h24) {
        NotchScene s = new NotchScene(data, now, Collections.emptyMap(), zone, h24);
        int glasses = s.water == null ? 0 : s.water.count;
        int goal = s.water == null ? data.body.water.goal : s.water.goal;
        long midnight = Instant.ofEpochMilli(now).atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli();
        NotchDay.Slot hero = s.hero;
        if (hero == null) return new NextUp(false, 0, EMPTY_TITLE, "", 0f, -1, false, TaskSymbol.TASK_ICON, glasses, goal, midnight);
        NotchDay.Task t = hero.task;
        long id = t.fixed ? 0 : t.id;
        int icon = t.fixed ? TaskSymbol.EVENT_ICON : TaskSymbol.icon(t.title);
        int tone = t.fixed ? -1 : t.tone;
        String when;
        float ring;
        long next;
        if (hero.runningAt(now)) {
            long left = minutesUntil(hero.end, now);
            when = "Now · " + left + " min left";
            ring = hero.end > hero.start ? (now - hero.start) / (float) (hero.end - hero.start) : 1f;
            next = Math.min(hero.end, hero.end - (left - 1) * MIN);
        } else if (hero.start - now <= RING_SPAN) {
            long left = minutesUntil(hero.start, now);
            when = "in " + left + " min";
            ring = 1f - (hero.start - now) / (float) RING_SPAN;
            next = hero.start - (left - 1) * MIN;
        } else {
            when = "at " + NotchDay.clock(hero.start, zone, h24);
            ring = 0f;
            next = hero.start - RING_SPAN;
        }
        return new NextUp(true, id, t.title, when, Math.max(0f, Math.min(1f, ring)), tone, t.fixed, icon, glasses, goal, Math.min(next, midnight));
    }

    private static long minutesUntil(long at, long now) {
        return Math.max(1, (at - now + MIN - 1) / MIN);
    }

    String spokenTask() {
        return hasTask ? title + ", " + when.replace(" · ", ", ") + ". Opens " + (taskId > 0 ? "the task." : "the plan.") : title + ". Opens the plan.";
    }

    String spokenWater() {
        return "Water, " + glasses + " of " + goal + " glasses. Opens water.";
    }

    String key() {
        return hasTask + "|" + taskId + "|" + title + "|" + when + "|" + Math.round(ring * 100) + "|" + tone + "|" + icon + "|" + glasses + "/" + goal;
    }
}

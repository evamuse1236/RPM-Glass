package com.rpm.prototype;

import com.rpm.prototype.PillPriority.Kind;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/** Everything the island draws at one moment, worked out from the planner store and the clock. */
final class NotchScene {
    /** The task in hand, or null when nothing timed is left today. */
    final NotchDay.Slot hero;
    final boolean running;
    final String pillValue;
    final String subtitle;
    final String barStart;
    final String barEnd;
    final float progress;
    final String spoken;
    final List<NotchContent.Row> rows = new ArrayList<>();
    /** Null when the app has no water store. */
    final NotchWater.Status water;
    final int snoozeMinutes;
    final boolean canLogMeal;

    NotchScene(NotchData data, long now, long localSnoozeUntil, ZoneId zone, boolean h24) {
        List<NotchDay.Slot> slots = NotchDay.today(data.tasks, now, zone);
        hero = NotchDay.hero(slots, now);
        running = hero != null && hero.runningAt(now);
        canLogMeal = data.body;
        NotchData.Water w = data.water;
        water = w == null ? null : NotchWater.status(w.glasses, w.settings, w.busy, Math.max(w.snoozedUntil, localSnoozeUntil), now, zone);
        snoozeMinutes = w == null ? 15 : w.settings.snoozeMinutes;
        if (hero == null) {
            pillValue = subtitle = barStart = barEnd = spoken = null;
            progress = 0;
        } else if (running) {
            pillValue = NotchDay.minutes(hero.end - now);
            subtitle = prefix(hero) + NotchDay.spoken(hero.end - now) + " left";
            barStart = NotchDay.minutes(Math.max(NotchDay.MIN, now - hero.start));
            barEnd = "-" + pillValue;
            progress = (now - hero.start) / (float) (hero.end - hero.start);
            spoken = hero.task.title + ", " + NotchDay.spoken(hero.end - now) + " left";
        } else {
            String at = NotchDay.clock(hero.start, zone, h24);
            pillValue = at;
            subtitle = prefix(hero) + at + ", in " + NotchDay.spoken(hero.start - now);
            barStart = at;
            barEnd = NotchDay.minutes(hero.end - hero.start);
            progress = 0;
            spoken = "Next: " + hero.task.title + " at " + at;
        }
        List<NotchContent.Row> upcoming = new ArrayList<>();
        for (NotchDay.Slot s : NotchDay.after(slots, hero, 3)) {
            upcoming.add(new NotchContent.Row(Kind.TASK, s.task.title, NotchDay.clock(s.start, zone, h24), s.start));
        }
        if (water != null && water.nextAt != 0) {
            String value = water.pending ? "Due now" : NotchDay.clock(water.nextAt, zone, h24);
            upcoming.add(new NotchContent.Row(Kind.WATER, "Water · " + water.count + " of " + water.goal, value, Math.max(water.nextAt, now)));
        }
        upcoming.sort((a, b) -> Long.compare(a.at, b.at));
        rows.addAll(upcoming.subList(0, Math.min(3, upcoming.size())));
    }

    /** Changes whenever anything the panel draws changes. */
    String key() {
        StringBuilder k = new StringBuilder(hero == null ? "-" : hero.task.id + "@" + hero.start);
        k.append('|').append(subtitle).append('|').append(barStart).append('|').append(barEnd).append('|').append(Math.round(progress * 1000));
        for (NotchContent.Row r : rows) k.append('|').append(r.title).append(r.value);
        if (water != null) k.append('|').append(waterValue()).append(water.pending);
        return k.append('|').append(canLogMeal).toString();
    }

    String waterValue() {
        return water.count + "/" + water.goal;
    }

    boolean waterDue() {
        return water != null && water.pending;
    }

    private static String prefix(NotchDay.Slot s) {
        return s.task.block == null || s.task.block.isEmpty() ? "" : s.task.block + " · ";
    }
}

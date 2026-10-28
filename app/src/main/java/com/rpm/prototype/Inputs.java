package com.rpm.prototype;

import java.time.ZoneId;
import java.util.List;

/** Everything a module may read: the clock, the store and its own local state. */
record Inputs(long now, ZoneId zone, boolean h24, List<NotchDay.Task> tasks, List<NotchWater.Busy> busy, NotchBody body,
              LocalState local) {
    static Inputs of(NotchData data, long now, ZoneId zone, boolean h24) {
        return new Inputs(now, zone, h24, data.tasks, data.busy, data.body, LocalState.EMPTY);
    }

    Inputs with(LocalState state) {
        return new Inputs(now, zone, h24, tasks, busy, body, state);
    }

    List<NotchDay.Slot> today() {
        return NotchDay.today(tasks, now, zone);
    }

    String clock(long at) {
        return NotchDay.clock(at, zone, h24);
    }

    String shortClock(long at) {
        return NotchDay.shortClock(at, now, zone, h24);
    }

    String minutes(long ms) {
        return NotchDay.minutes(ms);
    }

    String spoken(long ms) {
        return NotchDay.spoken(ms);
    }

    long snoozeMs() {
        return body.water.snoozeMinutes * NotchDay.MIN;
    }
}

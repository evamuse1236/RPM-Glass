package com.rpm.prototype;

import java.util.ArrayList;
import java.util.List;

/** Today's planner tasks: the running or next one as the hero, the rest as timed rows. */
final class TasksModule implements NotchModule {
    @Override
    public String id() {
        return "tasks";
    }

    @Override
    public Offer offer(Inputs in) {
        List<NotchDay.Slot> mine = new ArrayList<>();
        for (NotchDay.Slot s : in.today()) if (!s.task.fixed) mine.add(s);
        NotchDay.Slot hero = null;
        for (NotchDay.Slot s : mine) if (hero == null && s.runningAt(in.now())) hero = s;
        for (NotchDay.Slot s : mine) if (hero == null && s.end > in.now()) hero = s;
        List<Row> rows = new ArrayList<>();
        for (NotchDay.Slot s : mine) if (s != hero) rows.add(SlotOffers.row(s, in));
        return new Offer(hero == null ? null : SlotOffers.hero(hero, in), null, rows);
    }
}

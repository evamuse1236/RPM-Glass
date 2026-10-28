package com.rpm.prototype;

import com.rpm.prototype.NotchOffer.Act;
import com.rpm.prototype.NotchOffer.Inputs;
import com.rpm.prototype.NotchOffer.LocalState;
import com.rpm.prototype.NotchOffer.Nudge;
import com.rpm.prototype.NotchOffer.Offer;
import com.rpm.prototype.NotchOffer.Look;
import com.rpm.prototype.NotchOffer.Control;
import com.rpm.prototype.NotchOffer.Circle;
import com.rpm.prototype.NotchOffer.Trail;
import com.rpm.prototype.NotchOffer.Row;
import java.util.List;

/** The first routine with steps due now and not snoozed: a row and a Later-only nudge. */
final class RoutinesModule implements NotchModule {
    static final String ID = "routines";
    static final String UNTIL = "until:";

    @Override
    public String id() {
        return ID;
    }

    @Override
    public Offer offer(Inputs in) {
        if (!in.body().present) return Offer.NONE;
        NotchHabits.RoutineStatus due = null;
        for (NotchHabits.RoutineStatus r : NotchHabits.routines(in.body(), in.now(), in.zone())) {
            if (due == null && r.dueAt(in.now()) && in.local().getLong(UNTIL + r.routine.id, 0) <= in.now()) due = r;
        }
        if (due == null) return Offer.NONE;
        String name = due.routine.name;
        int minutes = in.body().water.snoozeMinutes;
        String snoozeSpoken = "Snooze " + name + " for " + minutes + " minutes";
        Act later = new Act.Local(ID, "later", due.routine.id, null, "+" + minutes + "m");
        Row row = new Row(Row.Place.NUDGE, 0, false, false, false, Look.HABIT, name,
                name + ", " + due.done + " of " + due.total, null,
                List.of(new Trail.Value(due.done + "/" + due.total, NotchInk.HABIT)),
                new Circle(R.drawable.notch_ic_snooze, NotchInk.HABIT, snoozeSpoken, later));
        String line = due.done + " of " + due.total + " steps";
        Nudge nudge = new Nudge(null, line, name + ", " + line, null,
                new Control(R.drawable.notch_ic_snooze, "Later", snoozeSpoken, later), null);
        return new Offer(null, nudge, List.of(row));
    }

    @Override
    public LocalState apply(String verb, String arg, Inputs in) {
        if (!"later".equals(verb)) return NotchModule.super.apply(verb, arg, in);
        return in.local().with(UNTIL + arg, String.valueOf(in.now() + in.snoozeMs()));
    }
}

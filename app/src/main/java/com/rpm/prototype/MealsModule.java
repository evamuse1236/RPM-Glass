package com.rpm.prototype;

import java.util.List;

/** The meal not logged yet: a row while it is open, and a nudge with Log meal and Later unless it is snoozed. */
final class MealsModule implements NotchModule {
    static final String ID = "meals";
    static final String UNTIL = "until:";

    @Override
    public String id() {
        return ID;
    }

    @Override
    public Offer offer(Inputs in) {
        NotchBody body = in.body();
        String slot = body.present ? NotchHabits.unloggedMeal(body, in.now(), in.zone()) : null;
        if (slot == null) return Offer.NONE;
        String name = NotchHabits.mealName(body, slot);
        Act open = new Act.Open(PlannerTarget.meal(slot));
        String logSpoken = "Log " + name + " in the planner";
        Row row = new Row(Row.Place.NUDGE, 0, false, false, false, Parts.Look.MEAL, name,
                name + ", not logged. Log it in the planner", open, List.of(),
                new Parts.Circle(R.drawable.notch_ic_plus, NotchInk.MEAL, logSpoken, open));
        if (in.local().getLong(UNTIL + slot, 0) > in.now()) return new Offer(null, null, List.of(row));
        NotchHabits.MealMeter meter = NotchHabits.mealMeter(body, in.now(), in.zone());
        int minutes = body.water.snoozeMinutes;
        String line = name + " not logged";
        Nudge nudge = new Nudge(new Parts.Meter.Meals(meter.slots, meter.logged), line, line + ". Opens the meal.",
                new Parts.Control(R.drawable.notch_ic_plus, "Log meal", logSpoken, open),
                new Parts.Control(R.drawable.notch_ic_snooze, "Later", "Snooze " + name + " for " + minutes + " minutes",
                        new Act.Local(ID, "later", slot, null, "+" + minutes + "m")),
                open);
        return new Offer(null, nudge, List.of(row));
    }

    @Override
    public LocalState apply(String verb, String arg, Inputs in) {
        if (!"later".equals(verb)) return NotchModule.super.apply(verb, arg, in);
        return in.local().with(UNTIL + arg, String.valueOf(in.now() + in.snoozeMs()));
    }
}

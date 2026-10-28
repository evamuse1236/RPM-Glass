package com.rpm.prototype;

import java.util.List;

/** Water: a row that always stays, and a nudge with Glass and Later while a glass is due. */
final class WaterModule implements NotchModule {
    static final String ID = "water";
    static final String UNTIL = "until:";

    @Override
    public String id() {
        return ID;
    }

    @Override
    public Offer offer(Inputs in) {
        NotchBody body = in.body();
        if (!body.present) return Offer.NONE;
        long snoozed = Math.max(body.waterSnoozedUntil, in.local().getLong(UNTIL, 0));
        NotchWater.Status st = NotchWater.status(body.glasses, body.water, in.busy(), snoozed, in.now(), in.zone());
        int count = st.count, goal = st.goal;
        boolean due = st.pending && body.water.reminders;
        Act drink = new Act.Save(new PlannerRequest.Drink(), new Parts.ReceiptSpec(Parts.Look.WATER, "Glass logged",
                (count + 1) + " of " + goal + " today", count / (float) goal, (count + 1) / (float) goal,
                new Parts.Meter.Water(goal, count + 1)));
        Parts.Circle circle = new Parts.Circle(R.drawable.notch_ic_plus, NotchInk.WATER, "Log a glass of water", drink);
        Row row = new Row(Row.Place.NUDGE, 0, false, due, true, Parts.Look.WATER, "Water",
                "Water, " + count + " of " + goal + (due ? " · due" : "") + ". Log a glass of water", drink,
                List.of(new Parts.Trail.Dots(count, goal), new Parts.Trail.Value(count + "/" + goal, NotchInk.WATER)), circle);
        if (!due) return new Offer(null, null, List.of(row));
        int minutes = body.water.snoozeMinutes;
        String line = count + " of " + goal + " glasses";
        Nudge nudge = new Nudge(new Parts.Meter.Water(goal, count), line, "Water due, " + line + ". Opens water.",
                new Parts.Control(R.drawable.notch_ic_plus, "Glass", "Log a glass of water", drink),
                new Parts.Control(R.drawable.notch_ic_snooze, "Later", "Snooze water for " + minutes + " minutes",
                        new Act.Local(ID, "later", "", null, "+" + minutes + "m")),
                new Act.Open(PlannerTarget.water()));
        return new Offer(null, nudge, List.of(row));
    }

    @Override
    public LocalState apply(String verb, String arg, Inputs in) {
        if (!"later".equals(verb)) return NotchModule.super.apply(verb, arg, in);
        return in.local().with(UNTIL + arg, String.valueOf(in.now() + in.snoozeMs()));
    }
}

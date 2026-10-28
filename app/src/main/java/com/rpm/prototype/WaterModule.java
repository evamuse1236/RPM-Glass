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
import com.rpm.prototype.NotchOffer.Meter;
import com.rpm.prototype.NotchOffer.ReceiptSpec;
import com.rpm.prototype.NotchOffer.PlannerRequest;
import com.rpm.prototype.NotchOffer.PlannerTarget;
import com.rpm.prototype.NotchOffer.Row;
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
        Act drink = new Act.Save(new PlannerRequest.Drink(), new ReceiptSpec(Look.WATER, "Glass logged",
                (count + 1) + " of " + goal + " today", count / (float) goal, (count + 1) / (float) goal,
                new Meter.Water(goal, count + 1)));
        Circle circle = new Circle(R.drawable.notch_ic_plus, NotchInk.WATER, "Log a glass of water", drink);
        Row row = new Row(Row.Place.NUDGE, 0, false, due, true, Look.WATER, "Water",
                "Water, " + count + " of " + goal + (due ? " · due" : "") + ". Log a glass of water", drink,
                List.of(new Trail.Dots(count, goal), new Trail.Value(count + "/" + goal, NotchInk.WATER)), circle);
        if (!due) return new Offer(null, null, List.of(row));
        int minutes = body.water.snoozeMinutes;
        String line = count + " of " + goal + " glasses";
        Nudge nudge = new Nudge(new Meter.Water(goal, count), line, "Water due, " + line + ". Opens water.",
                new Control(R.drawable.notch_ic_plus, "Glass", "Log a glass of water", drink),
                new Control(R.drawable.notch_ic_snooze, "Later", "Snooze water for " + minutes + " minutes",
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

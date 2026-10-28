package com.rpm.prototype;

import com.rpm.prototype.NotchOffer.Act;
import com.rpm.prototype.NotchOffer.Hero;
import com.rpm.prototype.NotchOffer.Inputs;
import com.rpm.prototype.NotchOffer.Look;
import com.rpm.prototype.NotchOffer.Control;
import com.rpm.prototype.NotchOffer.Circle;
import com.rpm.prototype.NotchOffer.Trail;
import com.rpm.prototype.NotchOffer.Art;
import com.rpm.prototype.NotchOffer.ReceiptSpec;
import com.rpm.prototype.NotchOffer.PlannerRequest;
import com.rpm.prototype.NotchOffer.PlannerTarget;
import com.rpm.prototype.NotchOffer.Row;
import java.util.List;

/** The hero and rows of one task or calendar occurrence, shared by the Tasks and Calendar modules. */
final class NotchSlotOffers {
    private NotchSlotOffers() {}

    static Hero hero(NotchDay.Slot s, Inputs in) {
        NotchDay.Task task = s.task;
        String about = NotchScene.about(task);
        String at = in.clock(s.start);
        boolean running = s.runningAt(in.now());
        Hero.Urgency urgency = running ? Hero.Urgency.RUNNING : Hero.Urgency.UPCOMING;
        String line, value, spoken, barSpoken;
        int ring = 0;
        if (running) {
            value = in.minutes(s.end - in.now());
            line = about.isEmpty() ? "Now" : about;
            ring = Math.round((in.now() - s.start) / (float) (s.end - s.start) * 1000);
            spoken = task.title + ", " + in.spoken(s.end - in.now()) + " left";
            barSpoken = in.minutes(Math.max(NotchDay.MIN, in.now() - s.start)) + " done, " + value + " left";
        } else {
            value = in.shortClock(s.start);
            line = about.isEmpty() ? "Next" : about;
            spoken = "Next: " + task.title + " at " + at;
            barSpoken = "Starts at " + at + ", lasts " + in.spoken(s.end - s.start);
        }
        Control primary = task.fixed ? null
                : new Control(R.drawable.ic_check, "Done", "Done: " + task.title, done(s));
        Art drop = task.fixed ? new Art.Capsule(Art.NEUTRAL, TaskSymbol.EVENT_ICON)
                : new Art.Capsule(task.tone, TaskSymbol.icon(task.title));
        return new Hero(urgency, s.start, look(s), task.title, line, ring, value, spoken, barSpoken, primary,
                new Act.Open(PlannerTarget.task(task.id)), drop, attached(s, in), row(s, in));
    }

    /** The hero's own alert still to come: its name and time, which opens its controls. */
    private static List<Row> attached(NotchDay.Slot s, Inputs in) {
        String alert = s.task.fixed ? "" : s.alertAt(in.now());
        if (alert.isEmpty()) return List.of();
        String at = in.clock(s.start);
        Act manage = manage(s, alert, at);
        Circle circle = new Circle(R.drawable.ic_chevron, NotchInk.WHITE_87, "Change the alert for " + s.task.title, manage);
        return List.of(new Row(Row.Place.ATTACHED, s.start, true, false, false, Look.alert(alert), Look.alertName(alert),
                alertSpoken(alert, s.task.title, at), manage, List.of(), circle));
    }

    static Row row(NotchDay.Slot s, Inputs in) {
        String alert = s.task.fixed ? "" : s.alertAt(in.now());
        boolean alerting = !alert.isEmpty();
        String at = in.clock(s.start);
        String title = s.task.title;
        Trail trail = alerting ? new Trail.AlertChip(alert, at) : new Trail.Value(at, NotchInk.WHITE_60);
        Circle circle = s.task.fixed ? null : new Circle(R.drawable.ic_check, NotchInk.WHITE_87, "Done: " + title, done(s));
        return new Row(Row.Place.TIMED, s.start, alerting, false, false, look(s), title,
                alerting ? alertSpoken(alert, title, at) : title + ", " + at, alerting ? manage(s, alert, at) : null, List.of(trail), circle);
    }

    private static Look look(NotchDay.Slot s) {
        return s.task.fixed ? Look.EVENT : Look.TASK;
    }

    private static Act done(NotchDay.Slot s) {
        return new Act.Save(new PlannerRequest.Done(s.task.id, s.start, !s.task.recurrence.isEmpty(), false),
                new ReceiptSpec(Look.TASK, "Done", s.task.title, 0f, 1f, null));
    }

    private static Act manage(NotchDay.Slot s, String alert, String at) {
        return new Act.ManageAlert(s.task.id, s.start, alert, s.task.title, at);
    }

    static String alertSpoken(String alert, String title, String at) {
        return Look.alertName(alert) + " at " + at + " for " + title + ". Opens its controls.";
    }
}

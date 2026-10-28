package com.rpm.prototype;

import java.util.List;

/** The hero and rows of one task or calendar occurrence, shared by the Tasks and Calendar modules. */
final class SlotOffers {
    private SlotOffers() {}

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
        Parts.Control primary = task.fixed ? null
                : new Parts.Control(R.drawable.ic_check, "Done", "Done: " + task.title, done(s));
        Parts.Art drop = task.fixed ? new Parts.Art.Capsule(Parts.Art.NEUTRAL, TaskSymbol.EVENT_ICON)
                : new Parts.Art.Capsule(task.tone, TaskSymbol.icon(task.title));
        return new Hero(urgency, s.start, look(s), task.title, line, ring, value, spoken, barSpoken, primary,
                new Act.Open(PlannerTarget.task(task.id)), drop, attached(s, in), row(s, in));
    }

    /** The hero's own alert still to come: its name and time, which opens its controls. */
    private static List<Row> attached(NotchDay.Slot s, Inputs in) {
        String alert = s.task.fixed ? "" : s.alertAt(in.now());
        if (alert.isEmpty()) return List.of();
        String at = in.clock(s.start);
        Act manage = manage(s, alert, at);
        Parts.Circle circle = new Parts.Circle(R.drawable.ic_chevron, NotchInk.WHITE_87, "Change the alert for " + s.task.title, manage);
        return List.of(new Row(Row.Place.ATTACHED, s.start, true, false, false, Parts.Look.alert(alert), Parts.Look.alertName(alert),
                alertSpoken(alert, s.task.title, at), manage, List.of(), circle));
    }

    static Row row(NotchDay.Slot s, Inputs in) {
        String alert = s.task.fixed ? "" : s.alertAt(in.now());
        boolean alerting = !alert.isEmpty();
        String at = in.clock(s.start);
        String title = s.task.title;
        Parts.Trail trail = alerting ? new Parts.Trail.AlertChip(alert, at) : new Parts.Trail.Value(at, NotchInk.WHITE_60);
        Parts.Circle circle = s.task.fixed ? null : new Parts.Circle(R.drawable.ic_check, NotchInk.WHITE_87, "Done: " + title, done(s));
        return new Row(Row.Place.TIMED, s.start, alerting, false, false, look(s), title,
                alerting ? alertSpoken(alert, title, at) : title + ", " + at, alerting ? manage(s, alert, at) : null, List.of(trail), circle);
    }

    private static Parts.Look look(NotchDay.Slot s) {
        return s.task.fixed ? Parts.Look.EVENT : Parts.Look.TASK;
    }

    private static Act done(NotchDay.Slot s) {
        return new Act.Save(new PlannerRequest.Done(s.task.id, s.start, !s.task.recurrence.isEmpty(), false),
                new Parts.ReceiptSpec(Parts.Look.TASK, "Done", s.task.title, 0f, 1f, null));
    }

    private static Act manage(NotchDay.Slot s, String alert, String at) {
        return new Act.ManageAlert(s.task.id, s.start, alert, s.task.title, at);
    }

    static String alertSpoken(String alert, String title, String at) {
        return Parts.Look.alertName(alert) + " at " + at + " for " + title + ". Opens its controls.";
    }
}

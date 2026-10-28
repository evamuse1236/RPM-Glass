package com.rpm.prototype;

import java.util.List;

/**
 * One line under the island's hero. {@code keep} rows stay when rows drop to fit; {@code due} rows move up to second;
 * {@code tap} and {@code circle} may be null.
 */
record Row(Place place, long at, boolean alerting, boolean due, boolean keep, Parts.Look look, String title, String spoken,
           Act tap, List<Parts.Trail> trail, Parts.Circle circle) {
    /** ATTACHED rows follow the hero; TIMED rows sort by {@code at}; NUDGE rows sit after the first timed row. */
    enum Place { ATTACHED, TIMED, NUDGE }

    Row withLook(Parts.Look next) {
        return new Row(place, at, alerting, due, keep, next, title, spoken, tap, trail, circle);
    }
}

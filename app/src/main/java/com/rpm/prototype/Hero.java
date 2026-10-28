package com.rpm.prototype;

import java.util.List;

/** A module's bid for the task island: one thing running now or next. */
record Hero(Urgency urgency, long at, Parts.Look look, String title, String line, int ringPermille, String value, String spoken,
            String barSpoken, Parts.Control primary, Act open, Parts.Art drop, List<Row> attached, Row asRow) {
    enum Urgency { RUNNING, UPCOMING }
}

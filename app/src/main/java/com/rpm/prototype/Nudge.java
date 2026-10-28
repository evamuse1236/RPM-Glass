package com.rpm.prototype;

/** A module's bid for the habit island. {@code meter} null means no pill drop; {@code hold} may be null. */
record Nudge(Parts.Meter meter, String line, String spoken, Parts.Control primary, Parts.Control later, Act hold) {}

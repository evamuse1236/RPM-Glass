package com.rpm.prototype;

import java.util.List;

/** What one module asks to show now. Any part may be absent. */
record Offer(Hero hero, Nudge nudge, List<Row> rows) {
    static final Offer NONE = new Offer(null, null, List.of());
}

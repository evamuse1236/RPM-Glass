package com.rpm.prototype;

import java.util.ArrayList;
import java.util.List;

/** What the island shows at one moment, arranged from every module's offer. {@code cut} counts rows past the three. */
record Scene(Owned<Hero> hero, Owned<Nudge> nudge, List<Row> rows, int cut, List<String> failed) {
    List<Row> attached() {
        return hero == null ? List.of() : hero.value().attached();
    }

    /** The first {@code n} rows. When rows must drop to fit, {@code keep} rows stay, so the island can always log a glass. */
    List<Row> visible(int n) {
        List<Row> out = new ArrayList<>(attached());
        out.addAll(rows);
        for (int i = out.size() - 1; out.size() > Math.max(0, n) && i >= 0; i--) {
            if (!out.get(i).keep() || n == 0) out.remove(i);
        }
        return out;
    }

    /** What the island leaves out when it shows {@code n} rows; it says "+N more" for them. */
    int more(int n) {
        return rows.size() + cut + attached().size() - visible(n).size();
    }

    Parts.Art taskDrop() {
        return hero == null ? null : hero.value().drop();
    }

    Parts.Art habitDrop() {
        return nudge == null || nudge.value().meter() == null ? null : new Parts.Art.Gauge(nudge.value().meter());
    }

    /** What a swipe on the pill does: the nudge's Later, or null when nothing is due. */
    Act later() {
        return nudge == null || nudge.value().later() == null ? null : nudge.value().later().act();
    }
}

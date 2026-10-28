package com.rpm.prototype;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Picks one hero and one nudge from the modules' offers and orders the rows under them. Offers come in registry order. */
final class NotchArbiter {
    static final int ROWS = 3;

    private NotchArbiter() {}

    static Scene arrange(List<Owned<Offer>> offers, List<String> failed) {
        Owned<Hero> hero = hero(offers);
        Owned<Nudge> nudge = nudge(offers);
        List<Row> timed = new ArrayList<>();
        List<Row> nudges = new ArrayList<>();
        for (Owned<Offer> o : offers) {
            Hero h = o.value().hero();
            if (h != null && (hero == null || h != hero.value())) timed.add(h.asRow());
            for (Row r : o.value().rows()) (r.place() == Row.Place.NUDGE ? nudges : timed).add(r);
        }
        timed.removeIf(r -> startsBeforeHero(r, hero));
        timed.sort(Comparator.comparingLong(Row::at));

        List<Row> rows = new ArrayList<>();
        if (!timed.isEmpty()) rows.add(timed.get(0));
        rows.addAll(nudges);
        if (timed.size() > 1) rows.addAll(timed.subList(1, timed.size()));
        if (hero == null || hero.value().attached().isEmpty()) {
            int i = 0;
            while (i < rows.size() && !rows.get(i).alerting()) i++;
            if (i > 0 && i < rows.size()) {
                Row alert = rows.remove(i);
                rows.add(0, alert.withLook(Parts.Look.alert(alertOf(alert))));
            }
        }
        for (int i = 2; i < rows.size(); i++) {
            if (rows.get(i).due()) {
                rows.add(1, rows.remove(i));
                break;
            }
        }
        int cut = Math.max(0, rows.size() - ROWS);
        return new Scene(hero, nudge, List.copyOf(rows.subList(0, Math.min(ROWS, rows.size()))), cut, List.copyOf(failed));
    }

    /** With no hero nothing timed is left today. */
    private static boolean startsBeforeHero(Row r, Owned<Hero> hero) {
        return hero == null || r.at() < hero.value().at();
    }

    /** Something running beats something upcoming; among running, registry order; among upcoming, the soonest. */
    private static Owned<Hero> hero(List<Owned<Offer>> offers) {
        Owned<Hero> best = null;
        for (Owned<Offer> o : offers) {
            Hero h = o.value().hero();
            if (h == null) continue;
            if (best == null || beats(h, best.value())) best = new Owned<>(o.module(), h);
        }
        return best;
    }

    private static boolean beats(Hero h, Hero best) {
        if (h.urgency() != best.urgency()) return h.urgency() == Hero.Urgency.RUNNING;
        return h.urgency() == Hero.Urgency.UPCOMING && h.at() < best.at();
    }

    /** The first nudge with a meter to draw, else the first nudge. */
    private static Owned<Nudge> nudge(List<Owned<Offer>> offers) {
        Owned<Nudge> first = null;
        for (Owned<Offer> o : offers) {
            Nudge n = o.value().nudge();
            if (n == null) continue;
            if (n.meter() != null) return new Owned<>(o.module(), n);
            if (first == null) first = new Owned<>(o.module(), n);
        }
        return first;
    }

    private static String alertOf(Row r) {
        for (Parts.Trail t : r.trail()) if (t instanceof Parts.Trail.AlertChip chip) return chip.alert();
        return "";
    }
}

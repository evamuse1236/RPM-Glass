package com.rpm.prototype;

import com.rpm.prototype.NotchOffer.Inputs;
import com.rpm.prototype.NotchOffer.Offer;
import com.rpm.prototype.NotchOffer.Row;
import java.util.ArrayList;
import java.util.List;

/** Today's calendar events: the running or next one as the hero, the rest as timed rows. Events have no Done. */
final class CalendarModule implements NotchModule {
    @Override
    public String id() {
        return "calendar";
    }

    @Override
    public Offer offer(Inputs in) {
        List<NotchDay.Slot> mine = new ArrayList<>();
        NotchDay.Slot hero = null;
        for (NotchDay.Slot s : in.today()) {
            if (!s.task.fixed) continue;
            mine.add(s);
            if (hero == null && s.end > in.now()) hero = s;
        }
        List<Row> rows = new ArrayList<>();
        for (NotchDay.Slot s : mine) if (s != hero) rows.add(NotchSlotOffers.row(s, in));
        return new Offer(hero == null ? null : NotchSlotOffers.hero(hero, in), null, rows);
    }
}

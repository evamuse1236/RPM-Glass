package com.rpm.prototype;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import com.rpm.prototype.NotchScene.Control;
import com.rpm.prototype.NotchScene.Look;

import java.util.ArrayList;
import java.util.List;

/**
 * The pill and the open island's face (playground/notch-view.mjs is its copy). The band's ring and value are drawn by
 * IslandBand; the face holds the title, the line in the accent, one primary control and up to three 44dp rows.
 */
final class NotchContent {
    interface Actions {
        /** Ticks the hero task in place, with Undo. */
        void done();

        /** Logs one glass in place, with Undo. */
        void drink();

        void snooze();

        void logMeal();

        void openAlert();

        void snoozeAlert();

        void stopAlert();

        /** A firing reminder's or a ringing alarm's Done: silences it and ticks its task in place, with Undo. */
        void doneAlert();

        /** Opens the alert controls for a task occurrence whose alert is still to come. */
        void manage(NotchDay.Slot slot);

        /** Ticks an occurrence an alert row shows, in place, with Undo. */
        void doneSlot(NotchDay.Slot slot);

        /** In the alert controls: "off", "reminder" or "alarm", in place, with Undo. */
        void setAlert(String type);

        void doneManaged();

        void openManaged();

        /** Takes back the change the receipt shows. */
        void undo();

        /** Opens the hero's task (or the day, for a calendar event) in the planner. */
        void openHero();
    }

    final NotchParts parts;
    private final Context context;

    NotchContent(Context context) {
        this.context = context;
        parts = new NotchParts(context);
    }

    /** The pill's face is empty: its ring and value are the band's, drawn over it. */
    View pill() {
        View v = new View(context);
        v.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        return v;
    }

    /** The split circle beside the pill: the second kind's live ring and glyph, no text. */
    View split(NotchBand band, int ringPx) {
        return new SplitRing(context, band, ringPx, NotchGeometry.PILL_STROKE_DP * context.getResources().getDisplayMetrics().density);
    }

    /** The open island: title, line, the hero's one control (two when Later sits beside Glass), then {@code maxRows} rows. */
    View panel(NotchScene scene, Actions actions, int maxRows) {
        LinearLayout col = new LinearLayout(context);
        FrameLayout face = parts.face(col);
        Look look = scene.heroLook;
        int accent = NotchInk.accent(look);
        parts.bandSpeaks(face, bandSpoken(scene), 0);
        if (scene.hero != null) {
            col.addView(parts.words(scene.heroTitle, scene.heroSubtitle, accent, "Open " + scene.heroTitle + " in the plan", actions::openHero));
        } else {
            col.addView(parts.title(scene.heroTitle));
            col.addView(parts.line(scene.heroSubtitle, accent));
        }

        List<View> pills = new ArrayList<>();
        for (Control c : scene.controls()) pills.add(control(c, scene, actions, pills.isEmpty(), accent));
        List<View> rows = rows(scene, actions, maxRows);
        if (!pills.isEmpty()) col.addView(parts.controls(pills.toArray(new View[0])), parts.controlsAt(rows.isEmpty()));
        if (!rows.isEmpty()) {
            LinearLayout list = parts.rows(!pills.isEmpty());
            for (View r : rows) list.addView(r);
            col.addView(list);
        }
        return face;
    }

    private View control(Control c, NotchScene scene, Actions actions, boolean primary, int heroAccent) {
        switch (c) {
            case DONE:
                return parts.pill(R.drawable.ic_check, "Done", "Done: " + scene.heroTitle, heroAccent, primary, actions::done);
            case GLASS:
                return parts.pill(R.drawable.notch_ic_water, "Glass", "Log a glass of water", NotchInk.WATER, primary, actions::drink);
            default:
                return parts.pill(R.drawable.notch_ic_snooze, "Later", "Snooze " + scene.snoozeMinutes + " minutes", heroAccent, primary, actions::snooze);
        }
    }

    private static String bandSpoken(NotchScene s) {
        if (s.hero != null) return s.spoken;
        return s.barSpoken.isEmpty() ? s.heroTitle : s.heroTitle + ", " + s.barSpoken;
    }

    private List<View> rows(NotchScene scene, Actions actions, int maxRows) {
        List<View> out = new ArrayList<>();
        for (NotchScene.Row row : scene.visibleRows(maxRows)) out.add(row(row, scene, actions));
        return out;
    }

    private View row(NotchScene.Row r, NotchScene scene, Actions actions) {
        int accent = r.look == Look.TASK || r.look == Look.EVENT ? NotchInk.WHITE_60 : NotchInk.accent(r.look);
        int gap = parts.dp(12);
        if (r.heros) {
            LinearLayout row = parts.row(NotchBand.icon(r.look), accent, r.title, NotchParts.alertSpoken(r.alert, scene.heroTitle, r.value),
                    () -> actions.manage(r.slot));
            NotchParts.trail(row, value(r.value, accent), gap);
            return row;
        }
        if (r.look == Look.WATER && scene.water != null) {
            LinearLayout row = parts.row(NotchBand.icon(r.look), accent, r.title, r.title + ", " + r.value + ". Log a glass of water", actions::drink);
            NotchParts.trail(row, new NotchParts.Dots(context, scene.water.count, scene.water.goal, parts.dp(7), parts.dp(4)), gap);
            NotchParts.trail(row, value(scene.waterValue(), NotchInk.WATER), parts.dp(10));
            row.addView(parts.glyph(R.drawable.notch_ic_plus, NotchInk.WATER), plusAt());
            return row;
        }
        if (!r.alert.isEmpty()) {
            LinearLayout row = parts.row(NotchBand.icon(r.look), accent, r.title, NotchParts.alertSpoken(r.alert, r.title, r.value), () -> actions.manage(r.slot));
            NotchParts.trail(row, parts.alertChip(r.alert, r.value), gap);
            View done = parts.circleButton(NotchInk.SECONDARY, NotchInk.PRESS, R.drawable.ic_check, NotchInk.WHITE_87, "Done: " + r.title,
                    () -> actions.doneSlot(r.slot));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(parts.dp(NotchGeometry.CONTROL_DP), parts.dp(NotchGeometry.CONTROL_DP));
            lp.setMarginStart(parts.dp(8));
            row.addView(done, lp);
            return row;
        }
        if (r.look == Look.MEAL) {
            LinearLayout row = parts.row(NotchBand.icon(r.look), accent, r.title, r.title + ", not logged. Log it in the planner", actions::logMeal);
            NotchParts.trail(row, value("Log", NotchInk.MEAL), gap);
            return row;
        }
        LinearLayout row = parts.row(NotchBand.icon(r.look), accent, r.title, r.title + ", " + r.value, null);
        String v = r.look == Look.HABIT && scene.habit != null ? NotchScene.habitValue(scene.habit) : r.value;
        NotchParts.trail(row, value(v, r.look == Look.HABIT ? NotchInk.HABIT : NotchInk.WHITE_60), gap);
        return row;
    }

    private View value(String s, int color) {
        return parts.text(s, 14, color, 500);
    }

    private LinearLayout.LayoutParams plusAt() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(parts.dp(20), parts.dp(20));
        lp.setMarginStart(parts.dp(10));
        return lp;
    }

    /** The split circle's content: one IslandBand ring, centred. */
    private static final class SplitRing extends View {
        private final IslandBand painter;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final NotchBand band;
        private final int ring;
        private final float stroke;

        SplitRing(Context context, NotchBand band, int ring, float stroke) {
            super(context);
            this.band = band;
            this.ring = ring;
            this.stroke = stroke;
            painter = new IslandBand(this);
            setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            painter.drawRing(canvas, paint, band, getWidth() / 2f, getHeight() / 2f, ring, stroke, band.progress);
        }
    }
}

package com.rpm.prototype;

import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

/**
 * The reminder and ringing-alarm islands (playground/notch-alert.mjs is their copy). The band holds the bell or the
 * pulsing clock and, trailing, the alert's time. Below: the title and line, which open the task. A reminder then has
 * Done and Snooze 10 min as two equal pills; a ringing alarm has Stop across the width over Snooze 10 min and Done.
 */
final class NotchAlertViews {
    private final NotchParts parts;

    NotchAlertViews(NotchContent content) {
        this.parts = content.parts;
    }

    /** Bell and time in the band, the title over "Reminder · 5:30 PM", then Done and Snooze 10 min. It never says alarm. */
    View reminder(NotchAlert alert, NotchContent.Actions actions) {
        LinearLayout col = new LinearLayout(parts.context);
        FrameLayout face = parts.face(col);
        parts.bandSpeaks(face, "Reminder at " + alert.at, 0);
        col.addView(words(alert.title, alert.reminderLine(), NotchInk.WHITE_70, alert.spoken(), actions));
        col.addView(parts.controls(
                parts.pill(R.drawable.ic_check, "Done", "Done: " + alert.title, NotchInk.TASK, true, actions::doneAlert),
                parts.pill(0, "Snooze " + NotchAlert.SNOOZE_MINUTES + " min", "Snooze " + alert.title + " for " + NotchAlert.SNOOZE_MINUTES + " minutes",
                        NotchInk.TASK, false, actions::snoozeAlert)), parts.controlsAt(true));
        return face;
    }

    /** Pulsing clock and time in the band, the title over "Ringing", then Stop across the width over Snooze 10 min and Done. */
    View alarm(NotchAlert alert, NotchContent.Actions actions) {
        LinearLayout col = new LinearLayout(parts.context);
        FrameLayout face = parts.face(col);
        parts.bandSpeaks(face, "Alarm ringing, " + alert.at, 0);
        col.addView(words(alert.title, alert.ringing(), NotchInk.ALARM, alert.spoken(), actions));
        col.addView(parts.controls(parts.pill(R.drawable.notch_ic_stop, "Stop", "Stop the alarm for " + alert.title, NotchInk.ALARM, true,
                actions::stopAlert)), parts.controlsAt(false));
        col.addView(parts.controls(
                parts.pill(0, "Snooze " + NotchAlert.SNOOZE_MINUTES + " min", "Snooze " + alert.title + " for " + NotchAlert.SNOOZE_MINUTES + " minutes",
                        NotchInk.ALARM, false, actions::snoozeAlert),
                parts.pill(R.drawable.ic_check, "Done", "Done: stop the alarm and tick " + alert.title, NotchInk.ALARM, false, actions::doneAlert)),
                parts.pairUnder());
        return face;
    }

    /** The title over the line; tapping the words opens the task, as the island's own tap does. */
    private View words(String title, String line, int lineColor, String spoken, NotchContent.Actions actions) {
        return parts.words(title, line, lineColor, spoken, actions::openAlert);
    }
}

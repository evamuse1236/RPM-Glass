package com.rpm.prototype;

import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

/**
 * The reminder and ringing-alarm islands (playground/notch-alert.mjs is their copy). The band holds the bell or the
 * pulsing clock and, trailing, the reminder's time or the alarm's Stop. Below: the title and line, which open the
 * task, then Done and Snooze 10 min as two equal pills.
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

    /** Pulsing clock and Stop in the band, the title over "Ringing · 5:30 PM", then Done and Snooze 10 min. */
    View alarm(NotchAlert alert, NotchContent.Actions actions) {
        LinearLayout col = new LinearLayout(parts.context);
        FrameLayout face = parts.face(col);
        int touch = parts.dp(NotchGeometry.TOUCH_DP);
        parts.bandSpeaks(face, "Alarm ringing, " + alert.at, NotchGeometry.TOUCH_DP);
        View stop = parts.circleButton(NotchInk.ALARM, NotchInk.intoBlack(NotchInk.ALARM, 0.8f), 0, NotchInk.ALARM_INK,
                "Stop the alarm for " + alert.title, actions::stopAlert);
        FrameLayout box = new FrameLayout(parts.context);
        box.addView(stop, new FrameLayout.LayoutParams(parts.dp(NotchGeometry.CONTROL_DP), parts.dp(NotchGeometry.CONTROL_DP), android.view.Gravity.CENTER));
        box.setOnClickListener(v -> stop.performClick());
        box.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        parts.bandControl(face, box, touch, true);
        col.addView(words(alert.title, alert.ringing(), NotchInk.ALARM, alert.spoken(), actions));
        col.addView(parts.controls(
                parts.pill(R.drawable.ic_check, "Done", "Done: stop the alarm and tick " + alert.title, NotchInk.ALARM, true, actions::doneAlert),
                parts.pill(0, "Snooze " + NotchAlert.SNOOZE_MINUTES + " min", "Snooze " + alert.title + " for " + NotchAlert.SNOOZE_MINUTES + " minutes",
                        NotchInk.ALARM, false, actions::snoozeAlert)), parts.controlsAt(true));
        return face;
    }

    /** The title over the line; tapping the words opens the task, as the island's own tap does. */
    private View words(String title, String line, int lineColor, String spoken, NotchContent.Actions actions) {
        LinearLayout words = new LinearLayout(parts.context);
        words.setOrientation(LinearLayout.VERTICAL);
        words.addView(parts.title(title));
        words.addView(parts.line(line, lineColor));
        words.setContentDescription(spoken);
        words.setOnClickListener(v -> NotchController.safely("open alert task", actions::openAlert));
        return words;
    }
}

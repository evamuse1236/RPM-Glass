package com.rpm.prototype;

import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.rpm.prototype.NotchScene.Look;

/**
 * The receipt after an in-place change, and the alert controls (playground/notch-change.mjs is their copy). The
 * receipt keeps the band: its ring steps or fills (IslandBand) and Undo takes the trailing slot.
 */
final class NotchChangeViews {
    private final NotchParts parts;

    NotchChangeViews(NotchContent content) {
        this.parts = content.parts;
    }

    /** "Glass logged" over "4 of 8 today" under the band, and Undo in the band once the change is saved. */
    View receipt(NotchReceipt r, NotchContent.Actions actions) {
        LinearLayout col = new LinearLayout(parts.context);
        FrameLayout face = parts.face(col);
        face.setContentDescription(r.spoken());
        col.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        col.addView(parts.wrapping(r.title, 16, Color.WHITE, 600, 1));
        TextView detail = parts.wrapping(r.detail, 13, r.state == NotchReceipt.State.PROBLEM ? NotchInk.ALARM : NotchInk.WHITE_70, 400, 2);
        detail.setPadding(0, parts.dp(2), 0, 0);
        col.addView(detail);
        if (r.canUndo()) {
            View undo = undo(r, actions);
            parts.bandControl(face, undo, ViewGroup.LayoutParams.WRAP_CONTENT, false);
        }
        return face;
    }

    /** Undo: a 40dp pill, the task blue 20% into black, 48dp to touch. */
    private View undo(NotchReceipt r, NotchContent.Actions actions) {
        int reach = (parts.dp(NotchGeometry.TOUCH_DP) - parts.dp(NotchGeometry.CONTROL_DP)) / 2;
        float radius = parts.dp(NotchGeometry.innerRadius(NotchGeometry.PAD_DP));
        TextView undo = parts.text("Undo", 15, NotchInk.TASK, 600);
        undo.setGravity(android.view.Gravity.CENTER);
        NotchParts.pillShape(undo, NotchInk.intoBlack(NotchInk.TASK, NotchInk.UNDO_SHARE), NotchInk.intoBlack(NotchInk.TASK, NotchInk.PRIMARY_SHARE),
                radius, reach, parts.dp(18));
        undo.setContentDescription("Undo: " + r.title);
        undo.setOnClickListener(v -> NotchController.safely("Undo", actions::undo));
        NotchParts.pressShrinks(undo);
        return undo;
    }

    /** The task and its alert, then Turn off as the one primary, and rows to switch the alert, tick it, or open it. */
    View manage(NotchFrame.Managed m, NotchContent.Actions actions) {
        LinearLayout col = new LinearLayout(parts.context);
        FrameLayout face = parts.face(col);
        boolean alarm = "alarm".equals(m.alert);
        int accent = alarm ? NotchInk.ALARM : NotchInk.TASK;
        parts.bandSpeaks(face, m.spoken(), 0);
        col.addView(parts.title(m.title));
        col.addView(parts.line(m.line(), alarm ? NotchInk.ALARM : NotchInk.WHITE_70));
        col.addView(parts.controls(parts.pill(R.drawable.notch_ic_alert_off, "Turn off", "Turn off the alert for " + m.title, accent, true,
                () -> actions.setAlert("off"))), parts.controlsAt(false));
        LinearLayout rows = parts.rows(true);
        rows.addView(parts.row(alarm ? R.drawable.ic_notification : R.drawable.ic_clock, NotchInk.accent(alarm ? Look.REMINDER : Look.ALARM),
                alarm ? "Make it a reminder" : "Make it a ringing alarm", alarm ? "Make it a reminder instead" : "Make it a ringing alarm instead",
                () -> actions.setAlert(alarm ? "reminder" : "alarm")));
        rows.addView(parts.row(R.drawable.ic_check, NotchInk.WHITE_60, "Done", "Done: " + m.title, actions::doneManaged));
        rows.addView(parts.row(R.drawable.ic_open, NotchInk.WHITE_60, "Open", "Open " + m.title + " in the plan", actions::openManaged));
        col.addView(rows);
        return face;
    }
}

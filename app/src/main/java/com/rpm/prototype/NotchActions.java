package com.rpm.prototype;

import android.content.Context;
import android.content.Intent;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * The panel's controls. Done and Log meal go through the planner, so its own save, log and Undo apply; the notch
 * never writes companion.json. Every action writes one diagnostics event (and a logcat line).
 */
final class NotchActions {
    private NotchActions() {}

    /** Done goes through the planner's own completion, so its "Task completed · Undo" bar is the way back. */
    static void complete(Context c, NotchDay.Slot slot) {
        try {
            planner(c, new JSONObject().put("view", "day").put("complete", slot.task.id).put("start", slot.start));
            log(c, "notch.done", "opened", payload("taskId", slot.task.id, "start", slot.start, "repeats", !slot.task.recurrence.isEmpty()));
        } catch (JSONException | RuntimeException e) {
            log(c, "notch.done", "error", payload("taskId", slot.task.id, "error", e.getClass().getSimpleName()));
            Log.e(NotchController.TAG, "could not open Done in the planner", e);
        }
    }

    /** Opens the meal log in the planner, for {@code slot} (the meal not logged yet, or null). */
    static void logMeal(Context c, String slot) {
        try {
            JSONObject target = new JSONObject().put("view", "meal");
            if (slot != null) target.put("slot", slot);
            planner(c, target);
            log(c, "notch.log_meal", "opened", payload("slot", slot == null ? "" : slot));
        } catch (JSONException | RuntimeException e) {
            log(c, "notch.log_meal", "error", payload("error", e.getClass().getSimpleName()));
            Log.e(NotchController.TAG, "could not open the meal log", e);
        }
    }

    /** Ask agent opens Capture, the same intent as the home-screen widget's capture pill. */
    static void askAgent(Context c) {
        try {
            c.startActivity(new Intent(c, CompanionActivity.class).setAction("com.rpm.widget.capture")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            log(c, "notch.ask_agent", "opened", null);
        } catch (RuntimeException e) {
            log(c, "notch.ask_agent", "error", payload("error", e.getClass().getSimpleName()));
            Log.e(NotchController.TAG, "could not open Capture", e);
        }
    }

    /** One structured line: logcat always, and the app's diagnostics log when the person has it connected. */
    static void log(Context c, String operation, String outcome, JSONObject payload) {
        JSONObject p = payload == null ? new JSONObject() : payload;
        Log.i(NotchController.TAG, operation + " " + outcome + " " + p);
        Diagnostics.record(c, Diagnostics.event("operation", "error".equals(outcome) ? "error" : "info", operation, outcome, p));
    }

    /** {@code payload("taskId", 4, "start", 1700000000000L)}: alternating keys and values. */
    static JSONObject payload(Object... pairs) {
        JSONObject p = new JSONObject();
        try {
            for (int i = 0; i + 1 < pairs.length; i += 2) p.put(String.valueOf(pairs[i]), pairs[i + 1]);
        } catch (JSONException e) {
            Log.w(NotchController.TAG, "diagnostics payload skipped a value", e);
        }
        return p;
    }

    /** CLEAR_TOP without SINGLE_TOP recreates an open planner, so it always reads the new target. */
    private static void planner(Context c, JSONObject target) {
        c.startActivity(new Intent(c, PlannerActivity.class).setAction("com.rpm.notch.open").putExtra("plannerTarget", target.toString())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
    }
}

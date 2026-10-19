package com.rpm.prototype;

import android.content.Context;
import android.content.Intent;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * The island's links into the planner: the meal row, Open and a task's sheet. Glass, Done and alert changes save in
 * place (NotchChanges); only these open the planner. Every action writes one diagnostics event (and a logcat line).
 */
final class NotchActions {
    private NotchActions() {}

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

    /** Opens a task's sheet in the planner, or the day's plan when {@code taskId} is 0 (a calendar event or a nudge). */
    static void openTask(Context c, long taskId) {
        try {
            JSONObject target = new JSONObject().put("view", "day");
            if (taskId > 0) target.put("id", taskId);
            planner(c, target);
            log(c, "notch.open_task", "opened", payload("taskId", taskId));
        } catch (JSONException | RuntimeException e) {
            log(c, "notch.open_task", "error", payload("taskId", taskId, "error", e.getClass().getSimpleName()));
            Log.e(NotchController.TAG, "could not open the task in the planner", e);
        }
    }

    /** A request for NotchRunner: {@code request("done", "id", 4, "start", 1700000000000L)}. */
    static JSONObject request(String action, Object... pairs) {
        JSONObject r = payload(pairs);
        try {
            r.put("action", action);
        } catch (JSONException e) {
            Log.w(NotchController.TAG, "notch request incomplete", e);
        }
        return r;
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

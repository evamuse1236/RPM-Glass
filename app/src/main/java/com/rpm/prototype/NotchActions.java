package com.rpm.prototype;

import android.content.Context;
import android.content.Intent;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

/** The panel's controls open the app's own screens; the notch itself never changes planner data. */
final class NotchActions {
    private NotchActions() {}

    /** Done goes through the planner's own completion, so its "Task completed · Undo" bar is the way back. */
    static void complete(Context c, NotchDay.Slot slot) {
        try {
            planner(c, new JSONObject().put("view", "day").put("complete", slot.task.id).put("start", slot.start));
        } catch (JSONException e) {
            Log.e(NotchController.TAG, "could not build the Done link", e);
        }
    }

    static void logMeal(Context c) {
        try {
            planner(c, new JSONObject().put("view", "meal"));
        } catch (JSONException e) {
            Log.e(NotchController.TAG, "could not build the meal link", e);
        }
    }

    /** The same intent as the home-screen widget's capture pill. */
    static void capture(Context c) {
        c.startActivity(new Intent(c, CompanionActivity.class).setAction("com.rpm.widget.capture")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
    }

    /** CLEAR_TOP without SINGLE_TOP recreates an open planner, so it always reads the new target. */
    private static void planner(Context c, JSONObject target) {
        c.startActivity(new Intent(c, PlannerActivity.class).setAction("com.rpm.notch.open").putExtra("plannerTarget", target.toString())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
    }
}

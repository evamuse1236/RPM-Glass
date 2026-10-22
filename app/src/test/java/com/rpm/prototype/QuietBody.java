package com.rpm.prototype;

import org.json.JSONArray;
import org.json.JSONObject;

/** A planner.body with water reminders and every meal off, for tests about the day alone. A store with no body reads as the defaults. */
final class QuietBody {
    private QuietBody() {}

    static JSONObject planner() throws Exception {
        return new JSONObject().put("body", body());
    }

    static JSONObject body() throws Exception {
        return new JSONObject()
                .put("water", new JSONObject().put("settings", new JSONObject().put("reminders", false)))
                .put("mealPlan", new JSONObject().put("slots", new JSONArray()));
    }
}

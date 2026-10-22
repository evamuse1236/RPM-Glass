package com.rpm.prototype;

import java.time.DayOfWeek;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A task's repeat as one key, read the way planner-recurrence.mjs reads it: "daily", "weekly", "weekdays",
 * "days:135" for chosen days (0 Sunday to 6 Saturday), or "" when it does not repeat on a calendar.
 */
final class Repeats {
    private Repeats() {}

    static String key(JSONObject e) {
        String r = e.optString("recurrence", "");
        if (!"days".equals(r)) return "daily".equals(r) || "weekly".equals(r) || "weekdays".equals(r) ? r : "";
        JSONArray days = e.optJSONArray("repeatDays");
        StringBuilder out = new StringBuilder();
        for (int d = 0; d <= 6; d++) {
            for (int i = 0; days != null && i < days.length(); i++) {
                if (days.optInt(i, -1) == d) { out.append(d); break; }
            }
        }
        return out.length() == 0 ? "" : "days:" + out;
    }

    static boolean repeating(String key) {
        return "daily".equals(key) || "weekly".equals(key) || "weekdays".equals(key) || key.startsWith("days:");
    }

    static boolean on(String key, DayOfWeek day) {
        if ("weekdays".equals(key)) return day != DayOfWeek.SATURDAY && day != DayOfWeek.SUNDAY;
        if (key.startsWith("days:")) return key.indexOf((char) ('0' + day.getValue() % 7), 5) >= 0;
        return true;
    }

    static int step(String key) {
        return "weekly".equals(key) ? 7 : 1;
    }

    /** Minutes before the task's time that its reminder or alarm sounds; 0 is on time. */
    static int lead(JSONObject e) {
        JSONObject intent = e.optJSONObject("alertIntent");
        int lead = intent == null ? 0 : intent.optInt("lead", 0);
        return Math.max(0, Math.min(1440, lead));
    }
}

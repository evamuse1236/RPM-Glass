package com.rpm.prototype;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** What the notch reads: the planner store (tasks and planner.body) and the calendars chosen in the planner. Read-only. */
final class NotchData {
    static final NotchData EMPTY = new NotchData(Collections.emptyList(), Collections.emptyList(), NotchBody.ABSENT);

    /** Open timed tasks, then calendar events (fixed). */
    final List<NotchDay.Task> tasks;
    /** Busy calendar events, which hold water nudges (busyEvents in body-api.mjs). */
    final List<NotchWater.Busy> busy;
    final NotchBody body;

    private NotchData(List<NotchDay.Task> tasks, List<NotchWater.Busy> busy, NotchBody body) {
        this.tasks = tasks;
        this.busy = busy;
        this.body = body;
    }

    static NotchData read(Context context) {
        JSONArray events = null;
        try {
            events = PlannerCalendar.read(context, System.currentTimeMillis()).optJSONArray("events");
        } catch (Exception e) {
            Log.w(NotchController.TAG, "calendar unreadable; notch shows tasks only", e);
        }
        try {
            JSONObject data = CompanionStore.read(context);
            return parse(data, events);
        } catch (Exception e) {
            Log.w(NotchController.TAG, "planner data unreadable; notch hides", e);
            return EMPTY;
        }
    }

    /** {@code data} is companion.json (null before the first save); {@code events} is PlannerCalendar's list (or null). */
    static NotchData parse(JSONObject data, JSONArray events) {
        List<NotchDay.Task> tasks = new ArrayList<>();
        if (data != null) {
            Map<String, String> blocks = new HashMap<>();
            JSONObject planner = data.optJSONObject("planner");
            JSONArray b = planner == null ? null : planner.optJSONArray("blocks");
            for (int i = 0; b != null && i < b.length(); i++) {
                JSONObject block = b.optJSONObject(i);
                if (block != null) blocks.put(block.optString("id"), block.optString("title"));
            }
            JSONArray entries = data.optJSONArray("entries");
            for (int i = 0; entries != null && i < entries.length(); i++) {
                NotchDay.Task task = task(entries.optJSONObject(i), blocks);
                if (task != null) tasks.add(task);
            }
        }
        List<NotchWater.Busy> busy = new ArrayList<>();
        for (int i = 0; events != null && i < events.length(); i++) {
            JSONObject e = events.optJSONObject(i);
            if (e == null || e.optBoolean("allDay")) continue;
            long start = e.optLong("start"), end = e.optLong("end");
            if (start <= 0 || end <= start) continue;
            if (e.optBoolean("busy", true)) busy.add(new NotchWater.Busy(start, end));
            tasks.add(new NotchDay.Task(0, e.optString("title", "Calendar commitment"), null, Instant.ofEpochMilli(start),
                    (int) ((end - start) / NotchDay.MIN), "", Collections.emptySet(), true, ""));
        }
        return new NotchData(tasks, busy, NotchBody.parse(data));
    }

    /** Open, timed plan entries only, as tasks() and occurrences() in the planner keep them. */
    private static NotchDay.Task task(JSONObject e, Map<String, String> blocks) {
        if (e == null || e.optBoolean("archived") || e.optBoolean("done") || "cancelled".equals(e.optString("state"))) return null;
        if (!"plan".equals(e.optString("kind", "plan"))) return null;
        long planned = time(e.opt("planned"));
        if (planned == 0) return null;
        Set<String> completed = new HashSet<>();
        JSONArray c = e.optJSONArray("completedOccurrences");
        for (int i = 0; c != null && i < c.length(); i++) completed.add(c.optString(i));
        int minutes = e.isNull("minutes") ? 30 : e.optInt("minutes", 30);
        String block = e.isNull("blockId") ? null : blocks.get(e.optString("blockId"));
        String title = e.optString("title", e.optString("raw"));
        return new NotchDay.Task(e.optLong("id"), title, block, Instant.ofEpochMilli(planned), minutes, e.optString("recurrence", ""), completed, false,
                alertType(e));
    }

    /** "alarm", "reminder" or "": the task's alertIntent, else an older store's alert (CompanionAlerts schedules by this). */
    static String alertType(JSONObject e) {
        JSONObject intent = e.optJSONObject("alertIntent"), alert = e.optJSONObject("alert");
        String type = intent == null ? "" : intent.optString("type", "");
        if (type.isEmpty() || type.equals("null")) type = alert == null ? "" : alert.optString("type", "");
        return type.equals("alarm") || type.equals("reminder") ? type : "";
    }

    /** Epoch ms of an ISO date-time, or 0 when absent or unreadable. */
    static long time(Object v) {
        if (!(v instanceof String) || ((String) v).isEmpty()) return 0;
        try {
            return OffsetDateTime.parse((String) v).toInstant().toEpochMilli();
        } catch (RuntimeException e) {
            return 0;
        }
    }
}

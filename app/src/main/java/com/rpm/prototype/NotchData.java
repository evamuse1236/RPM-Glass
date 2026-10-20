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
import java.util.concurrent.Callable;

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

    /** The store and calendar now; {@code last} again when the store cannot be read, so the island never blinks out. */
    static NotchData read(Context context, NotchData last) {
        JSONArray events = null;
        try {
            events = PlannerCalendar.read(context, System.currentTimeMillis()).optJSONArray("events");
        } catch (Exception e) {
            Log.w(NotchController.TAG, "calendar unreadable; notch shows tasks only", e);
        }
        return readOr(last, () -> {
            try {
                return CompanionStore.read(context);
            } catch (Exception e) {
                Log.w(NotchController.TAG, "planner data unreadable; notch keeps what it showed", e);
                throw e;
            }
        }, events);
    }

    /** {@code store} reads companion.json; when it throws, the island keeps showing {@code last}. */
    static NotchData readOr(NotchData last, Callable<JSONObject> store, JSONArray events) {
        try {
            return parse(store.call(), events);
        } catch (Exception e) {
            return last;
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
            Map<String, Integer> tones = tones(planner);
            JSONArray entries = data.optJSONArray("entries");
            for (int i = 0; entries != null && i < entries.length(); i++) {
                NotchDay.Task task = task(entries.optJSONObject(i), blocks, tones);
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
    static Map<String, Integer> tones(JSONObject planner) {
        Map<String, Integer> out = new HashMap<>();
        if (planner == null) return out;
        Map<String, Integer> areas = new HashMap<>();
        JSONArray a = planner.optJSONArray("areas");
        for (int i = 0; a != null && i < a.length(); i++) {
            JSONObject area = a.optJSONObject(i);
            if (area != null) areas.put(area.optString("id"), area.has("colorIndex") && !area.isNull("colorIndex") ? area.optInt("colorIndex") : i % 8);
        }
        Map<String, String> goalArea = links(planner.optJSONArray("goals"), "areaId");
        Map<String, String> projectGoal = links(planner.optJSONArray("projects"), "goalId");
        Map<String, String> blockProject = links(planner.optJSONArray("blocks"), "projectId");
        for (Map.Entry<String, String> block : blockProject.entrySet()) {
            Integer tone = areas.get(goalArea.get(projectGoal.get(block.getValue())));
            if (tone != null) out.put(block.getKey(), tone);
        }
        return out;
    }

    private static Map<String, String> links(JSONArray items, String field) {
        Map<String, String> out = new HashMap<>();
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null && !item.isNull(field)) out.put(item.optString("id"), item.optString(field));
        }
        return out;
    }

    private static NotchDay.Task task(JSONObject e, Map<String, String> blocks, Map<String, Integer> tones) {
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
        Integer tone = e.isNull("blockId") ? null : tones.get(e.optString("blockId"));
        return new NotchDay.Task(e.optLong("id"), title, block, Instant.ofEpochMilli(planned), minutes, e.optString("recurrence", ""), completed, false,
                alertType(e), e.optString("purpose", ""), tone == null ? -1 : tone);
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

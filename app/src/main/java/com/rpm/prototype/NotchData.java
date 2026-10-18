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

/** What the notch reads from the private planner store. Read-only: it never writes companion.json. */
final class NotchData {
    static final NotchData EMPTY = new NotchData(Collections.emptyList(), null, false);

    /** The Body store's water, as body-state.mjs shapes it. */
    static final class Water {
        final List<Long> glasses;
        final NotchWater.Settings settings;
        final List<NotchWater.Busy> busy;
        final long snoozedUntil;

        Water(List<Long> glasses, NotchWater.Settings settings, List<NotchWater.Busy> busy, long snoozedUntil) {
            this.glasses = glasses;
            this.settings = settings;
            this.busy = busy;
            this.snoozedUntil = snoozedUntil;
        }
    }

    final List<NotchDay.Task> tasks;
    /** Null when the app has no Body water store yet; the notch then shows no water at all. */
    final Water water;
    /** True when the Body store exists, so the planner has somewhere to log a meal. */
    final boolean body;

    private NotchData(List<NotchDay.Task> tasks, Water water, boolean body) {
        this.tasks = tasks;
        this.water = water;
        this.body = body;
    }

    static NotchData read(Context context) {
        try {
            JSONObject data = CompanionStore.read(context);
            return data == null ? EMPTY : parse(data);
        } catch (Exception e) {
            Log.w(NotchController.TAG, "planner data unreadable; notch hides", e);
            return EMPTY;
        }
    }

    static NotchData parse(JSONObject data) {
        Map<String, String> blocks = new HashMap<>();
        JSONObject planner = data.optJSONObject("planner");
        JSONArray b = planner == null ? null : planner.optJSONArray("blocks");
        for (int i = 0; b != null && i < b.length(); i++) {
            JSONObject block = b.optJSONObject(i);
            if (block != null) blocks.put(block.optString("id"), block.optString("title"));
        }
        List<NotchDay.Task> tasks = new ArrayList<>();
        JSONArray entries = data.optJSONArray("entries");
        for (int i = 0; entries != null && i < entries.length(); i++) {
            NotchDay.Task task = task(entries.optJSONObject(i), blocks);
            if (task != null) tasks.add(task);
        }
        JSONObject body = data.optJSONObject("body");
        return new NotchData(tasks, body == null ? null : water(body), body != null);
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
        return new NotchDay.Task(e.optLong("id"), title, block, Instant.ofEpochMilli(planned), minutes, e.optString("recurrence", ""), completed);
    }

    private static Water water(JSONObject body) {
        JSONObject w = body.optJSONObject("water");
        if (w == null) w = body;
        JSONArray g = w.optJSONArray("glasses");
        if (g == null) return null;
        List<Long> glasses = new ArrayList<>();
        for (int i = 0; i < g.length(); i++) {
            long at = time(g.opt(i));
            if (at != 0) glasses.add(at);
        }
        NotchWater.Settings s = new NotchWater.Settings();
        JSONObject o = w.optJSONObject("settings");
        if (o != null) {
            s.goal = Math.max(1, o.optInt("goal", s.goal));
            s.intervalMinutes = Math.max(1, o.optInt("intervalMinutes", s.intervalMinutes));
            s.from = clock(o.optString("from"), s.from);
            s.until = clock(o.optString("until"), s.until);
            s.snoozeMinutes = Math.max(1, o.optInt("snoozeMinutes", s.snoozeMinutes));
        }
        List<NotchWater.Busy> busy = new ArrayList<>();
        JSONArray bz = w.optJSONArray("busy");
        for (int i = 0; bz != null && i < bz.length(); i++) {
            JSONObject x = bz.optJSONObject(i);
            if (x != null && time(x.opt("start")) != 0 && time(x.opt("end")) != 0) busy.add(new NotchWater.Busy(time(x.opt("start")), time(x.opt("end"))));
        }
        return new Water(glasses, s, busy, time(w.opt("snoozedUntil")));
    }

    private static String clock(String v, String fallback) {
        return v != null && v.matches("\\d{2}:\\d{2}") ? v : fallback;
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

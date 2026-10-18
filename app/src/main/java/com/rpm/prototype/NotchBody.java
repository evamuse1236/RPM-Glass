package com.rpm.prototype;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The notch's only reader of routines, water and meals: {@code planner.body} in companion.json, as body-store.mjs
 * (bodyOf) writes it. If that shape changes, change this class and nothing else. Read-only.
 *
 * <pre>
 * planner.body = {
 *   routines: [{id, name, start: "HH:MM", end: "HH:MM", days: [0..6, Sunday = 0], steps: [{id, title}], archived?}],
 *   runs:     [{routineId, day: "YYYY-MM-DD", marks: {stepId: {state: "done"|"skipped", at}}, skippedDay?}],
 *   water:    {settings: {goal, intervalMinutes, from, until, snoozeMinutes, reminders}, glasses: [ISO], snoozedUntil: ISO|null},
 *   meals:    [{id, name, slot: "breakfast"|"lunch"|"snack"|"dinner", at: ISO}]
 * }
 * </pre>
 */
final class NotchBody {
    /** No {@code planner.body} yet: the notch shows no water, routines or meals. */
    static final NotchBody ABSENT = new NotchBody(false, Collections.emptyList(), new NotchWater.Settings(), 0,
            Collections.emptyList(), Collections.emptyMap(), Collections.emptyList());

    static final class Step {
        final String id;
        final String title;

        Step(String id, String title) {
            this.id = id;
            this.title = title;
        }
    }

    static final class Routine {
        final String id;
        final String name;
        /** Minutes after local midnight. */
        final int start;
        final int end;
        /** Sunday = 0, as JavaScript's Date#getDay. */
        final Set<Integer> days;
        final List<Step> steps;

        Routine(String id, String name, int start, int end, Set<Integer> days, List<Step> steps) {
            this.id = id;
            this.name = name;
            this.start = start;
            this.end = end;
            this.days = days;
            this.steps = steps;
        }
    }

    static final class Run {
        /** Step id to "done" or "skipped". */
        final Map<String, String> marks;
        final boolean skippedDay;

        Run(Map<String, String> marks, boolean skippedDay) {
            this.marks = marks;
            this.skippedDay = skippedDay;
        }
    }

    static final class Meal {
        final String slot;
        final long at;

        Meal(String slot, long at) {
            this.slot = slot;
            this.at = at;
        }
    }

    final boolean present;
    final List<Long> glasses;
    final NotchWater.Settings water;
    final long waterSnoozedUntil;
    /** Routines not deleted (archived), in stored order. */
    final List<Routine> routines;
    private final Map<String, Run> runs;
    final List<Meal> meals;

    private NotchBody(boolean present, List<Long> glasses, NotchWater.Settings water, long waterSnoozedUntil,
                      List<Routine> routines, Map<String, Run> runs, List<Meal> meals) {
        this.present = present;
        this.glasses = glasses;
        this.water = water;
        this.waterSnoozedUntil = waterSnoozedUntil;
        this.routines = routines;
        this.runs = runs;
        this.meals = meals;
    }

    /** The run of {@code routineId} on {@code day} (YYYY-MM-DD), or null when nothing is marked yet. */
    Run run(String routineId, String day) {
        return runs.get(routineId + "|" + day);
    }

    static NotchBody parse(JSONObject data) {
        JSONObject planner = data == null ? null : data.optJSONObject("planner");
        JSONObject body = planner == null ? null : planner.optJSONObject("body");
        if (body == null) return ABSENT;
        JSONObject water = body.optJSONObject("water");
        if (water == null) water = new JSONObject();
        List<Long> glasses = new ArrayList<>();
        JSONArray g = water.optJSONArray("glasses");
        for (int i = 0; g != null && i < g.length(); i++) {
            long at = NotchData.time(g.opt(i));
            if (at != 0) glasses.add(at);
        }
        return new NotchBody(true, glasses, settings(water.optJSONObject("settings")), NotchData.time(water.opt("snoozedUntil")),
                routines(body.optJSONArray("routines")), runs(body.optJSONArray("runs")), meals(body.optJSONArray("meals")));
    }

    private static NotchWater.Settings settings(JSONObject o) {
        NotchWater.Settings s = new NotchWater.Settings();
        if (o == null) return s;
        s.goal = Math.max(1, o.optInt("goal", s.goal));
        s.intervalMinutes = Math.max(1, o.optInt("intervalMinutes", s.intervalMinutes));
        if (minutes(o.optString("from")) >= 0) s.from = pad(o.optString("from"));
        if (minutes(o.optString("until")) >= 0) s.until = pad(o.optString("until"));
        s.snoozeMinutes = Math.max(1, o.optInt("snoozeMinutes", s.snoozeMinutes));
        s.reminders = o.optBoolean("reminders", true);
        return s;
    }

    private static List<Routine> routines(JSONArray a) {
        List<Routine> out = new ArrayList<>();
        for (int i = 0; a != null && i < a.length(); i++) {
            JSONObject r = a.optJSONObject(i);
            if (r == null || r.optBoolean("archived")) continue;
            int start = minutes(r.optString("start")), end = minutes(r.optString("end"));
            if (start < 0 || end < 0) continue;
            Set<Integer> days = new HashSet<>();
            JSONArray d = r.optJSONArray("days");
            for (int j = 0; d != null && j < d.length(); j++) days.add(d.optInt(j, -1));
            List<Step> steps = new ArrayList<>();
            JSONArray s = r.optJSONArray("steps");
            for (int j = 0; s != null && j < s.length(); j++) {
                JSONObject step = s.optJSONObject(j);
                if (step != null) steps.add(new Step(step.optString("id"), step.optString("title")));
            }
            out.add(new Routine(r.optString("id"), r.optString("name"), start, end, days, steps));
        }
        return out;
    }

    private static Map<String, Run> runs(JSONArray a) {
        Map<String, Run> out = new HashMap<>();
        for (int i = 0; a != null && i < a.length(); i++) {
            JSONObject r = a.optJSONObject(i);
            if (r == null) continue;
            Map<String, String> marks = new LinkedHashMap<>();
            JSONObject m = r.optJSONObject("marks");
            JSONArray names = m == null ? null : m.names();
            for (int j = 0; names != null && j < names.length(); j++) {
                JSONObject mark = m.optJSONObject(names.optString(j));
                if (mark != null) marks.put(names.optString(j), mark.optString("state"));
            }
            out.put(r.optString("routineId") + "|" + r.optString("day"), new Run(marks, r.optBoolean("skippedDay")));
        }
        return out;
    }

    private static List<Meal> meals(JSONArray a) {
        List<Meal> out = new ArrayList<>();
        for (int i = 0; a != null && i < a.length(); i++) {
            JSONObject m = a.optJSONObject(i);
            long at = m == null ? 0 : NotchData.time(m.opt("at"));
            if (at != 0) out.add(new Meal(m.optString("slot"), at));
        }
        return out;
    }

    /** Minutes after midnight of "H:MM" or "HH:MM", or -1 when unreadable (minutesOf in body-state.mjs). */
    static int minutes(String hhmm) {
        if (hhmm == null || !hhmm.matches("\\d{1,2}:\\d{2}")) return -1;
        int colon = hhmm.indexOf(':');
        int h = Integer.parseInt(hhmm.substring(0, colon)), m = Integer.parseInt(hhmm.substring(colon + 1));
        return h > 23 || m > 59 ? -1 : h * 60 + m;
    }

    private static String pad(String hhmm) {
        return hhmm.length() == 4 ? "0" + hhmm : hhmm;
    }
}

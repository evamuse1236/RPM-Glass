package com.rpm.prototype;

import java.time.*;
import java.util.Locale;
import java.util.regex.*;

/** Intentionally small, deterministic English parser. Never rewrites original text. */
public final class CaptureParser {
    public static final class Parsed {
        public Long plannedAt;
        public int minutes = 30;
        public boolean explicitDuration;
        public String notice = "No time set · edit any details after saving";
    }
    private static final Pattern DURATION = Pattern.compile("(?i)\\b(\\d{1,4})\\s*(minutes?|mins?|hours?|hrs?)\\b");
    private static final Pattern CLOCK = Pattern.compile("(?i)\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b|\\b(\\d{1,2}):(\\d{2})\\b");
    public static Parsed parse(String raw, ZonedDateTime now) {
        Parsed result = new Parsed();
        String text = raw.toLowerCase(Locale.ROOT);
        Matcher d = DURATION.matcher(text);
        if (d.find()) {
            int n = Integer.parseInt(d.group(1));
            if (d.group(2).startsWith("h")) n *= 60;
            if (n > 0 && n <= 1440) { result.minutes = n; result.explicitDuration = true; }
        }
        // Only apply time when an explicit supported date is present. This avoids guessing
        // tomorrow for a time-only phrase, or turning "next Friday" into today's date.
        LocalDate date = null;
        Matcher iso = Pattern.compile("\\b(\\d{4}-\\d{2}-\\d{2})\\b").matcher(text);
        try {
            if (iso.find()) date = LocalDate.parse(iso.group(1));
            else if (text.matches(".*\\btomorrow\\b.*")) date = now.toLocalDate().plusDays(1);
            else if (text.matches(".*\\btoday\\b.*")) date = now.toLocalDate();
        } catch (DateTimeException ignored) { result.notice = "Date needs review · original text preserved"; return result; }
        Matcher t = CLOCK.matcher(text);
        if (date != null && t.find()) {
            try {
                int h, m;
                if (t.group(1) != null) {
                    h = Integer.parseInt(t.group(1)); m = t.group(2) == null ? 0 : Integer.parseInt(t.group(2));
                    if (h < 1 || h > 12) throw new DateTimeException("Invalid hour");
                    h = h % 12 + (t.group(3).equalsIgnoreCase("pm") ? 12 : 0);
                } else { h = Integer.parseInt(t.group(4)); m = Integer.parseInt(t.group(5)); }
                LocalDateTime local = LocalDateTime.of(date, LocalTime.of(h, m));
                if (now.getZone().getRules().getValidOffsets(local).size() != 1) {
                    result.notice = "Clock-change time needs review"; return result;
                }
                long timestamp = local.atZone(now.getZone()).toInstant().toEpochMilli();
                if (timestamp <= now.toInstant().toEpochMilli()) {
                    result.notice = "That time has passed · choose a time if needed";
                } else {
                    result.plannedAt = timestamp;
                    result.notice = "Time interpreted locally · editable · no reminder set";
                }
            } catch (DateTimeException ex) { result.notice = "Time needs review · original text preserved"; }
        } else if (date != null || t.find(0)) {
            result.notice = "Choose a full date and time if needed · original text preserved";
        }
        return result;
    }
    /** Narrow grammar: 'Actually, twenty' is a candidate, never permission to mutate. */
    public static Integer correctionMinutes(String raw) {
        String text = raw.trim().toLowerCase(Locale.ROOT).replaceAll("[,.!?]", " ").replaceAll("\\s+", " ").trim();
        if (!text.startsWith("actually ")) return null;
        text = text.substring(9).replaceFirst("^(make (it|that) |just )", "")
                .replaceFirst(" (minutes?|mins?)$", "");
        switch (text) {
            case "ten": return 10;
            case "fifteen": return 15;
            case "twenty": return 20;
            case "thirty": return 30;
            case "forty five": case "forty-five": return 45;
            case "sixty": return 60;
            default:
                if (text.matches("\\d{1,4}")) { int n = Integer.parseInt(text); return n > 0 && n <= 1440 ? n : null; }
                return null;
        }
    }
}

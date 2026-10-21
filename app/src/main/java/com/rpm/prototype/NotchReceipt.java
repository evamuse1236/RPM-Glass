package com.rpm.prototype;

/**
 * What the island says after a change it made in place: "Glass logged · 4 of 8 today", "Done · Write RM essay",
 * "Alert off". Its mark plays once from {@code startedAt}, so redrawing the receipt (saving, then saved) never replays
 * it. Undo shows once the change is saved ({@code token}); a problem shows the page's own words and no Undo.
 */
final class NotchReceipt {
    enum State { SAVING, SAVED, UNDOING, UNDONE, PROBLEM }

    /** How long a saved change keeps its Undo, and how long "Undone" or a problem stays. */
    static final long UNDO_MS = 5_000;
    static final long UNDONE_MS = 1_500;
    static final long PROBLEM_MS = 4_000;
    static final long MARK_MS = 600;

    final State state;
    /** What the mark draws: "water", "done", "reminder", "alarm" or "off". */
    final String mark;
    final String title;
    final String detail;
    /** The planner change Undo hands back; null until saved. */
    final String token;
    final long startedAt;
    /** The mark's ring before and after: a glass moves water's ring a step, Done fills it. */
    final float from;
    final float to;
    /** When Undo runs out (uptime ms); 0 until saved. Undo's pill drains toward it. */
    final long undoUntil;
    final boolean meter;
    final int goal;

    NotchReceipt(State state, String mark, String title, String detail, String token, long startedAt, float from, float to) {
        this(state, mark, title, detail, token, startedAt, from, to, 0L, false, 0);
    }

    private NotchReceipt(State state, String mark, String title, String detail, String token, long startedAt, float from, float to, long undoUntil,
                         boolean meter, int goal) {
        this.meter = meter;
        this.goal = goal;
        this.undoUntil = undoUntil;
        this.state = state;
        this.mark = mark;
        this.title = title;
        this.detail = detail;
        this.token = token;
        this.startedAt = startedAt;
        this.from = from;
        this.to = to;
    }

    /** One glass on the way: the ring steps from count to count + 1 of the goal while it saves. */
    static NotchReceipt glass(int count, int goal, long now) {
        return glass(count, goal, now, false);
    }

    static NotchReceipt glass(int count, int goal, long now, boolean meter) {
        int g = Math.max(1, goal);
        return new NotchReceipt(State.SAVING, "water", "Glass logged", (count + 1) + " of " + g + " today", null, now,
                Math.min(1f, count / (float) g), Math.min(1f, (count + 1) / (float) g), 0L, meter, g);
    }

    int fromCount() {
        return Math.round(from * goal);
    }

    int toCount() {
        return Math.round(to * goal);
    }

    static NotchReceipt done(String title, long now) {
        return new NotchReceipt(State.SAVING, "done", "Done", title, null, now, 0f, 1f);
    }

    /** "Alert off", "Reminder set" or "Ringing alarm set" for {@code title}. */
    static NotchReceipt alert(String type, String title, long now) {
        String said = "off".equals(type) ? "Alert off" : NotchScene.alertName(type) + " set";
        return new NotchReceipt(State.SAVING, type, said, title, null, now, 1f, 1f);
    }

    /** Saved at {@code now} (uptime ms): Undo lasts {@link #UNDO_MS} from then. */
    NotchReceipt saved(String token, String detail, long now) {
        return new NotchReceipt(State.SAVED, mark, title, detail == null ? this.detail : detail, token, startedAt, from, to, now + UNDO_MS, meter, goal);
    }

    /** The share of Undo's time still left at {@code now}: 1 when saved, 0 when it runs out. */
    float undoLeft(long now) {
        if (undoUntil <= 0) return 0f;
        return Math.max(0f, Math.min(1f, (undoUntil - now) / (float) UNDO_MS));
    }

    /** Undo on its way: the mark plays back from where it ended. */
    NotchReceipt undoing(long now) {
        return new NotchReceipt(State.UNDOING, mark, "Undone", "water".equals(mark) ? "Glass removed" : detail, null, now, to, from, 0L, meter, goal);
    }

    NotchReceipt undone() {
        return new NotchReceipt(State.UNDONE, mark, title, detail, null, startedAt, from, to, 0L, meter, goal);
    }

    /** {@code message} is the page's userMessage(error), or the runner's own "did not respond". */
    NotchReceipt problem(String message) {
        return new NotchReceipt(State.PROBLEM, mark, "Not saved", message == null || message.isEmpty() ? "Try again." : message, null, startedAt, from, from,
                0L, meter, goal);
    }

    boolean canUndo() {
        return state == State.SAVED && token != null;
    }

    String spoken() {
        return title + ". " + detail + (canUndo() ? ". Undo is available." : "");
    }

    String key() {
        return state + ":" + mark + ":" + title + ":" + detail + ":" + (token != null) + ":" + startedAt + ":" + from + ":" + to + ":" + meter;
    }
}

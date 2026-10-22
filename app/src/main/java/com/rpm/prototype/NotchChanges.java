package com.rpm.prototype;

import android.content.Context;
import android.os.Handler;
import android.os.SystemClock;

import org.json.JSONObject;

/**
 * The changes the island makes in place: Glass, Done (also from a reminder or a ringing alarm) and an alert's type.
 * Each one saves through NotchRunner, shows a receipt at once, and keeps Undo for five seconds once saved. The
 * planner never opens for them.
 */
final class NotchChanges {
    private final Context service;
    private final NotchController owner;
    private final Handler handler;
    private final NotchRunner runner;
    private NotchReceipt receipt;
    /** Counts receipts, so a late answer for an older one leaves a newer receipt alone. */
    private int serial;
    private final Runnable end = () -> NotchController.safely("receipt ends", this::dismiss);

    NotchChanges(Context service, NotchController owner, Handler handler, NotchRunner runner) {
        this.service = service;
        this.owner = owner;
        this.handler = handler;
        this.runner = runner;
    }

    NotchReceipt receipt() {
        return receipt;
    }

    /** One glass toward today's goal; from the habit island, its meter shows the receipt. */
    void drink(NotchWater.Status water, boolean meter) {
        int count = water == null ? 0 : water.count, goal = water == null ? 8 : water.goal;
        save("notch.drink", NotchActions.request("drink"), NotchReceipt.glass(count, goal, now(), meter));
    }

    /** Ticks a task occurrence the island shows (the hero, or the one in the alert controls). */
    void done(NotchDay.Slot slot) {
        if (slot == null || slot.task.fixed) return;
        save("notch.done", NotchActions.request("done", "id", slot.task.id, "start", slot.start, "repeats", !slot.task.recurrence.isEmpty()),
                NotchReceipt.done(slot.task.title, now()));
    }

    /** Ticks the task of an alert that fired at {@code when}: a snoozed alert fires late, so the occurrence may start earlier. */
    void doneAt(long taskId, String title, long when) {
        save("notch.alert_done", NotchActions.request("done", "id", taskId, "start", when, "near", true), NotchReceipt.done(title, now()));
    }

    /** "off", "reminder" or "alarm" for the occurrence's task; Android's schedule follows the saved store. */
    void setAlert(NotchDay.Slot slot, String type) {
        save("notch.alert_" + type, NotchActions.request("alert", "id", slot.task.id, "type", type), NotchReceipt.alert(type, slot.task.title, now()));
    }

    void undo() {
        NotchReceipt shown = receipt;
        if (shown == null || !shown.canUndo()) return;
        int mine = show(shown.undoing(now()), 0);
        runner.run(NotchActions.request("undo", "token", shown.token), answer -> {
            if (mine != serial) return;
            NotchActions.log(service, "notch.undo", answer.optBoolean("ok") ? "ok" : "error", NotchActions.payload("kind", shown.mark));
            NotchReceipt next = receipt;
            if (answer.optBoolean("ok")) show(next.undone(), NotchReceipt.UNDONE_MS);
            else show(next.problem(answer.optString("message")), NotchReceipt.PROBLEM_MS);
        });
    }

    /** Ends the receipt early (swipe up) or on time; the island folds to the pill. */
    void dismiss() {
        handler.removeCallbacks(end);
        if (receipt == null) return;
        receipt = null;
        serial++;
        owner.render();
    }

    void detach() {
        handler.removeCallbacks(end);
        receipt = null;
        serial++;
    }

    private void save(String operation, JSONObject request, NotchReceipt saving) {
        int mine = show(saving, 0);
        runner.run(request, answer -> {
            if (answer.optBoolean("ok")) {
                NotchActions.log(service, operation, "saved", NotchActions.payload("kind", answer.optString("kind")));
                if (mine == serial) show(receipt.saved(answer.optString("token", null), detail(answer), now()), NotchReceipt.UNDO_MS);
            } else {
                NotchActions.log(service, operation, "error", null);
                if (mine == serial) show(receipt.problem(answer.optString("message")), NotchReceipt.PROBLEM_MS);
            }
        });
    }

    /** The saved count replaces the guessed one: "4 of 8 today". */
    private static String detail(JSONObject answer) {
        if ("water".equals(answer.optString("kind"))) return answer.optInt("count") + " of " + answer.optInt("goal") + " today";
        return null;
    }

    /** Shows {@code next}; it ends after {@code forMs}, or waits for an answer when 0. Returns its serial. */
    private int show(NotchReceipt next, long forMs) {
        boolean same = receipt != null && next.startedAt == receipt.startedAt;
        receipt = next;
        if (!same) serial++;
        owner.state.close();
        handler.removeCallbacks(end);
        if (forMs > 0) handler.postDelayed(end, forMs);
        owner.render();
        return serial;
    }

    private static long now() {
        return SystemClock.uptimeMillis();
    }
}

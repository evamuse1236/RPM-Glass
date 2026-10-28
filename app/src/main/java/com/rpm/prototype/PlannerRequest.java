package com.rpm.prototype;

/** A change the planner saves for the notch, with its Undo. */
sealed interface PlannerRequest {
    record Drink() implements PlannerRequest {}
    record Done(long id, long start, boolean repeats, boolean near) implements PlannerRequest {}
    record SetAlert(long id, String type) implements PlannerRequest {}
    record Undo(String token) implements PlannerRequest {}
}

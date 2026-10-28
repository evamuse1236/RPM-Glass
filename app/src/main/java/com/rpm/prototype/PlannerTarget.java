package com.rpm.prototype;

/** Where the planner opens: a view, with a meal slot or a task id when it needs one. */
record PlannerTarget(String view, String slot, long id) {
    static PlannerTarget day() {
        return new PlannerTarget("day", null, 0);
    }

    static PlannerTarget task(long id) {
        return new PlannerTarget("day", null, id);
    }

    static PlannerTarget water() {
        return new PlannerTarget("water", null, 0);
    }

    static PlannerTarget meal(String slot) {
        return new PlannerTarget("meal", slot, 0);
    }
}

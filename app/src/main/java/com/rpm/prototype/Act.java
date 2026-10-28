package com.rpm.prototype;

/** What a tap does, as data: the controller runs it. */
sealed interface Act {
    record Save(PlannerRequest request, Parts.ReceiptSpec receipt) implements Act {}
    /** A change only the notch keeps (a snooze); the owning module's {@code apply} runs it. */
    record Local(String module, String verb, String arg, Parts.ReceiptSpec receipt, String note) implements Act {}
    record Open(PlannerTarget target) implements Act {}
    record ManageAlert(long taskId, long start, String alert, String title, String at) implements Act {}
}

package com.rpm.prototype;

import java.util.EnumMap;
import java.util.Map;

/**
 * Decides what the collapsed pill shows: one slot per kind. A new nudge leads for its emphasis time, then steps aside
 * to the split circle while the task returns; it stays there until it is answered or dismissed.
 */
final class PillPriority {
    enum Kind {
        TASK(0),
        WATER(8_000);

        final long emphasisMs;

        Kind(long emphasisMs) {
            this.emphasisMs = emphasisMs;
        }
    }

    static final class Item {
        final Kind kind;
        final String text;
        final long postedAt;

        Item(Kind kind, String text, long postedAt) {
            this.kind = kind;
            this.text = text;
            this.postedAt = postedAt;
        }

        long emphasisEndsAt() {
            return postedAt + kind.emphasisMs;
        }

        boolean emphasizedAt(long now) {
            return kind != Kind.TASK && now < emphasisEndsAt();
        }
    }

    private final Map<Kind, Item> slots = new EnumMap<>(Kind.class);

    /** Shows {@code text} for {@code kind}. A kind already showing keeps its clock, so a refresh never re-alerts. */
    void show(Kind kind, String text, long now) {
        Item old = slots.get(kind);
        slots.put(kind, new Item(kind, text, old == null ? now : old.postedAt));
    }

    void dismiss(Kind kind) {
        slots.remove(kind);
    }

    boolean has(Kind kind) {
        return slots.containsKey(kind);
    }

    Item primary(long now) {
        Item lead = null;
        for (Item item : slots.values()) if (item.emphasizedAt(now)) lead = item;
        if (lead != null) return lead;
        Item task = slots.get(Kind.TASK);
        if (task != null) return task;
        for (Item item : slots.values()) lead = item;
        return lead;
    }

    /** The runner-up, drawn as the split island's second circle. */
    Item secondary(long now) {
        Item first = primary(now);
        if (first == null) return null;
        if (first.kind != Kind.TASK && slots.containsKey(Kind.TASK)) return slots.get(Kind.TASK);
        Item other = null;
        for (Item item : slots.values()) if (item.kind != first.kind) other = item;
        return other;
    }

    /** When the shown pill next changes on its own, or Long.MAX_VALUE if it never does. */
    long nextChangeAt(long now) {
        long next = Long.MAX_VALUE;
        for (Item item : slots.values()) if (item.emphasizedAt(now)) next = Math.min(next, item.emphasisEndsAt());
        return next;
    }
}

package com.rpm.prototype.notchlab;

import java.util.EnumMap;
import java.util.Map;

/** Decides what the collapsed pill shows: one slot per kind, the highest live kind wins. */
final class PillPriority {
    enum Kind {
        TASK(0),
        WATER(8_000),
        MEAL(12_000),
        AGENT(4_000);

        final long showMs;

        Kind(long showMs) {
            this.showMs = showMs;
        }

        boolean expires() {
            return showMs > 0;
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

        long expiresAt() {
            return kind.expires() ? postedAt + kind.showMs : Long.MAX_VALUE;
        }

        boolean liveAt(long now) {
            return now < expiresAt();
        }
    }

    private final Map<Kind, Item> slots = new EnumMap<>(Kind.class);

    void post(Kind kind, String text, long now) {
        slots.put(kind, new Item(kind, text, now));
    }

    void dismiss(Kind kind) {
        slots.remove(kind);
    }

    void clearNudges() {
        Item task = slots.get(Kind.TASK);
        slots.clear();
        if (task != null) slots.put(Kind.TASK, task);
    }

    Item primary(long now) {
        return ranked(now, null);
    }

    /** The runner-up, drawn as the split island's second circle. */
    Item secondary(long now) {
        Item first = primary(now);
        return first == null ? null : ranked(now, first.kind);
    }

    /** When the shown pill next changes on its own, or Long.MAX_VALUE if it never does. */
    long nextChangeAt(long now) {
        long next = Long.MAX_VALUE;
        for (Item item : slots.values()) {
            if (item.liveAt(now)) next = Math.min(next, item.expiresAt());
        }
        return next;
    }

    private Item ranked(long now, Kind skip) {
        Kind[] kinds = Kind.values();
        for (int i = kinds.length - 1; i >= 0; i--) {
            if (kinds[i] == skip) continue;
            Item item = slots.get(kinds[i]);
            if (item != null && item.liveAt(now)) return item;
        }
        return null;
    }
}

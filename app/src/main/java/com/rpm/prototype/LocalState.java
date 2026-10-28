package com.rpm.prototype;

import java.util.HashMap;
import java.util.Map;

/** What one module keeps on the phone only, as strings by key. */
record LocalState(Map<String, String> values) {
    static final LocalState EMPTY = new LocalState(Map.of());

    LocalState {
        values = Map.copyOf(values);
    }

    long getLong(String key, long fallback) {
        String v = values.get(key);
        if (v == null) return fallback;
        try {
            return Long.parseLong(v);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    LocalState with(String key, String value) {
        Map<String, String> out = new HashMap<>(values);
        out.put(key, value);
        return new LocalState(out);
    }

    LocalState without(Iterable<String> keys) {
        Map<String, String> out = new HashMap<>(values);
        for (String k : keys) out.remove(k);
        return new LocalState(out);
    }
}

package com.rpm.prototype;

/**
 * Decides when the overlay is redrawn and when its window is resized. A frame already on screen costs nothing: no
 * redraw, no animation and no window relayout. A morph resizes the window twice: once to hold both shapes, once when it
 * settles on the new one.
 */
final class IslandWindow {
    private String shown;
    private Box window;

    /** True when {@code key} is what the island already shows. */
    boolean showing(String key) {
        return key.equals(shown);
    }

    /**
     * Starts showing {@code key}, whose settled window is {@code target}, while {@code drawn} is the window the island
     * needs right now. Returns the window to resize to, or null to keep the current one.
     */
    Box begin(String key, Box target, Box drawn, boolean animate) {
        shown = key;
        Box want = window == null || !animate ? target : target.union(drawn);
        if (want.equals(window)) return null;
        window = want;
        return want;
    }

    /** The morph ended on {@code target}: the window to shrink to, or null when it already fits. */
    Box settle(Box target) {
        if (target.equals(window)) return null;
        window = target;
        return target;
    }

    Box current() {
        return window;
    }

    /** The window is gone: the next frame is drawn from scratch. */
    void forget() {
        shown = null;
        window = null;
    }
}

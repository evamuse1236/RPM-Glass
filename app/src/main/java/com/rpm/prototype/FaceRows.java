package com.rpm.prototype;

import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;

/** Finds an island face's rows, so a new face can bring them in one after another. */
final class FaceRows {
    private FaceRows() {
    }

    /** The face's column of rows (a vertical LinearLayout at most two levels down) when it has more than one row. */
    static ViewGroup of(View face) {
        for (int depth = 0; depth < 3 && face instanceof ViewGroup; depth++) {
            ViewGroup g = (ViewGroup) face;
            if (g instanceof LinearLayout && ((LinearLayout) g).getOrientation() == LinearLayout.VERTICAL) {
                return g.getChildCount() > 1 ? g : null;
            }
            face = column(g);
        }
        return null;
    }

    /** True when {@code child} is {@code v} or sits inside it. */
    static boolean within(View child, View v) {
        for (View at = child; at != null; at = at.getParent() instanceof View ? (View) at.getParent() : null) if (at == v) return true;
        return false;
    }

    private static View column(ViewGroup g) {
        for (int i = 0; i < g.getChildCount(); i++) if (g.getChildAt(i) instanceof LinearLayout) return g.getChildAt(i);
        return null;
    }
}

package com.rpm.prototype;

final class GlassTip {
    static final long MS = 1300;
    static final long SEGMENT_MS = 460;
    private static final float[] AT = {0f, 0.2f, 0.42f, 0.64f, 0.82f, 1f};
    private static final float[] LEVEL = {0f, 0.5f, 1f, 1f, 1f, 1f};
    private static final float[] DEGREES = {0f, -11f, 7f, -3.5f, 1.5f, 0f};

    final float level;
    final float degrees;
    final float segment;

    private GlassTip(float level, float degrees, float segment) {
        this.level = level;
        this.degrees = degrees;
        this.segment = segment;
    }

    static GlassTip at(long elapsedMs) {
        if (elapsedMs >= MS) return new GlassTip(1f, 0f, 1f);
        float t = bezier(0.3f, 0f, 0.4f, 1f, Math.max(0f, elapsedMs / (float) MS));
        int i = 1;
        while (i < AT.length - 1 && t > AT[i]) i++;
        float p = (t - AT[i - 1]) / (AT[i] - AT[i - 1]);
        float segment = bezier(0.2f, 0f, 0f, 1f, Math.min(1f, Math.max(0f, elapsedMs / (float) SEGMENT_MS)));
        return new GlassTip(mix(LEVEL[i - 1], LEVEL[i], p), mix(DEGREES[i - 1], DEGREES[i], p), segment);
    }

    static GlassTip still() {
        return new GlassTip(1f, 0f, 1f);
    }

    static float bezier(float x1, float y1, float x2, float y2, float x) {
        if (x <= 0f) return 0f;
        if (x >= 1f) return 1f;
        float lo = 0f, hi = 1f, s = x;
        for (int k = 0; k < 40; k++) {
            s = (lo + hi) / 2f;
            if (curve(x1, x2, s) < x) lo = s;
            else hi = s;
        }
        return curve(y1, y2, s);
    }

    private static float curve(float a, float b, float s) {
        float u = 1f - s;
        return 3f * u * u * s * a + 3f * u * s * s * b + s * s * s;
    }

    private static float mix(float a, float b, float t) {
        return a + (b - a) * t;
    }
}

package com.rpm.prototype;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.WebView;
import org.json.JSONObject;

/** Debug prefs that arm voice clocks and the fake mic. Release strips the bodies. */
final class VoiceHarness {
    private VoiceHarness() {}

    static void arm(WebView web, Context context) {
        if (!BuildConfig.DEBUG || web == null) return;
        SharedPreferences prefs = context.getSharedPreferences("rpm-voice", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("RPM_VOICE_TIMING", false)) return;
        String fixture = fixtureId(prefs.getString("RPM_FAKE_MIC", ""));
        String delay = delayJson(prefs.getString("RPM_VOICE_DELAY", ""));
        boolean hold = !fixture.isEmpty();
        web.evaluateJavascript("window.__rpmVoiceTiming=true;window.__rpmVoiceHoldStart=" + hold
            + ";window.__rpmFakeMic=" + (hold ? JSONObject.quote(fixture) : "null")
            + ";window.__rpmVoiceDelay=" + (delay.isEmpty() ? "null" : delay) + ";", null);
    }

    static boolean holding(Context context) {
        if (!BuildConfig.DEBUG) return false;
        SharedPreferences prefs = context.getSharedPreferences("rpm-voice", Context.MODE_PRIVATE);
        return prefs.getBoolean("RPM_VOICE_TIMING", false) && !fixtureId(prefs.getString("RPM_FAKE_MIC", "")).isEmpty();
    }

    private static String fixtureId(String raw) {
        return raw != null && raw.matches("[A-Za-z0-9_-]{1,40}") ? raw : "";
    }

    private static String delayJson(String raw) {
        return raw != null && raw.matches("\\{\"stage\":\"T(?:10|[1-9])\",\"ms\":\\d{1,5}\\}") ? raw : "";
    }
}

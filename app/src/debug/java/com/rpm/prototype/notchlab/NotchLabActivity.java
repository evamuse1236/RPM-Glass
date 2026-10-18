package com.rpm.prototype.notchlab;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Debug-only screen that drives both notch approaches and shows what the OS granted. */
public final class NotchLabActivity extends Activity {
    private TextView status;
    private LinearLayout body;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ScrollView scroll = new ScrollView(this);
        scroll.setFitsSystemWindows(true);
        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        body.setPadding(pad, pad, pad, pad);
        scroll.addView(body);
        setContentView(scroll);

        status = new TextView(this);
        status.setTypeface(Typeface.MONOSPACE);
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        status.setPadding(0, dp(8), 0, dp(8));
        body.addView(status);

        section("A · Live Update (notification)");
        button("Grant notification permission", () -> {
            if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        });
        button("Start Live Update (task)", () -> LiveUpdates.startTask(this));
        button("Start Live Update (water)", () -> LiveUpdates.startWater(this));
        button("Stop Live Updates", () -> LiveUpdates.stop(this));
        button("Open Live Update settings for RPM", () -> {
            if (Build.VERSION.SDK_INT >= 36) {
                startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            } else {
                startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            }
        });

        section("B · Overlay pill (accessibility service)");
        button("Open accessibility settings", () -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        button("Pill: task only", NotchOverlays::taskOnly);
        button("Pill: water nudge (8 s)", () -> NotchOverlays.post(PillPriority.Kind.WATER, "Water"));
        button("Pill: meal prompt (12 s)", () -> NotchOverlays.post(PillPriority.Kind.MEAL, "Lunch?"));
        button("Pill: agent message (4 s)", () -> NotchOverlays.post(PillPriority.Kind.AGENT, "Moved Gym to 7 PM"));
        button("Pill: expand", () -> NotchOverlays.setExpanded(true));
        button("Pill: collapse", () -> NotchOverlays.setExpanded(false));
        button("Pill: hide", NotchOverlays::hideAccessibility);
        button("Open touch probe (full-screen app under the pill)", () -> startActivity(new Intent(this, NotchTouchProbeActivity.class)));
        button("Toggle plain overlay (TYPE_APPLICATION_OVERLAY)", () -> {
            if (!Settings.canDrawOverlays(this)) {
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
                return;
            }
            NotchOverlays.togglePlain(this);
        });
        button("Refresh status", () -> {});
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        refresh();
    }

    private void refresh() {
        boolean notifications = Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        String enabled = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        boolean a11yEnabled = enabled != null && enabled.contains(getPackageName() + "/" + NotchAccessibilityService.class.getName());
        status.setText("Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + "), " + Build.MANUFACTURER + " " + Build.MODEL
                + "\nNotification permission: " + (notifications ? "granted" : "NOT granted")
                + "\n" + LiveUpdates.status(this)
                + "\nAccessibility service: " + (a11yEnabled ? "enabled" : "NOT enabled") + ", " + (NotchOverlays.accessibilityConnected() ? "connected" : "not connected")
                + "\nDraw over other apps: " + (Settings.canDrawOverlays(this) ? "granted" : "NOT granted")
                + "\n" + NotchPill.cutoutDescription(this)
                + "\n" + NotchOverlays.status());
    }

    private void section(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(16), 0, dp(4));
        body.addView(t);
    }

    private void button(String label, Runnable action) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setOnClickListener(v -> {
            action.run();
            refresh();
            status.postDelayed(this::refresh, 600);
        });
        body.addView(b, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}

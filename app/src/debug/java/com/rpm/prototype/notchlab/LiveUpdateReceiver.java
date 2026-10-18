package com.rpm.prototype.notchlab;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

/** Handles the water Live Update's "Drank it" and "Snooze 15" actions. */
public final class LiveUpdateReceiver extends BroadcastReceiver {
    static final String ACTION_DRANK = "com.rpm.prototype.notchlab.DRANK";
    static final String ACTION_SNOOZE = "com.rpm.prototype.notchlab.SNOOZE";
    static final String ACTION_WATER = "com.rpm.prototype.notchlab.WATER";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_DRANK.equals(action)) {
            LiveUpdates.glasses = Math.min(LiveUpdates.WATER_GOAL, LiveUpdates.glasses + 1);
            LiveUpdates.startWater(context);
            NotchOverlays.renderAll();
        } else if (ACTION_SNOOZE.equals(action)) {
            LiveUpdates.snoozeWater(context);
            Toast.makeText(context, "Water snoozed for 15 min", Toast.LENGTH_SHORT).show();
        } else if (ACTION_WATER.equals(action)) {
            LiveUpdates.startWater(context);
        }
    }
}

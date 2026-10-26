package com.rpm.prototype;

import android.content.SharedPreferences;

final class NotchSnooze {
    static boolean later(NotchScene scene, SharedPreferences prefs, long now) {
        if (scene == null || scene.topHabit == null) return false;
        String key = scene.topHabit == NotchHabits.Habit.WATER
                ? NotchScene.WATER_SNOOZE : NotchScene.mealSnooze(scene.meal);
        prefs.edit().putLong("snooze:" + key, now + scene.snoozeMinutes * NotchDay.MIN).apply();
        return true;
    }
}

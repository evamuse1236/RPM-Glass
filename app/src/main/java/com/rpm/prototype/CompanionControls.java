package com.rpm.prototype;

import android.app.NotificationManager;
import android.content.*;
import android.provider.Settings;
import org.json.*;

/** Small allowlist of non-secret app controls shared with conversational capture. */
final class CompanionControls {
    private static final String APPEARANCE="companion-appearance";
    private static final int DEFAULT_TEXT_SCALE=100,MIN_TEXT_SCALE=80,MAX_TEXT_SCALE=160;
    static int widgetTextScale(Context c){return Math.max(MIN_TEXT_SCALE,Math.min(MAX_TEXT_SCALE,c.getSharedPreferences(APPEARANCE,0).getInt("widget-text-scale",DEFAULT_TEXT_SCALE)));}
    static JSONObject read(Context c)throws JSONException {
        NotificationManager notifications=c.getSystemService(NotificationManager.class);
        boolean fullScreenSupported=android.os.Build.VERSION.SDK_INT>=34;
        return new JSONObject().put("transparency",c.getSharedPreferences(APPEARANCE,0).getInt("transparency",28))
            .put("widgetTextScale",widgetTextScale(c))
            .put("alarmSound",AlertSounds.alarmName(c)).put("reminderSound",AlertSounds.reminderName(c,CompanionAlerts.REMINDERS))
            .put("aiConnected",CompanionKey.has(c)).put("notificationsAllowed",CompanionAlerts.notifications(c,CompanionAlerts.REMINDERS))
            .put("exactAlarmsAllowed",CompanionAlerts.exact(c)).put("overlayAllowed",Settings.canDrawOverlays(c))
            .put("fullScreenSupported",fullScreenSupported).put("fullScreenAllowed",!fullScreenSupported||notifications.canUseFullScreenIntent())
            .put("launcherRunning",ButterflyService.isRunning())
            .put("backupCount",backupCount(c))
            .put("calendarAccess","Read-only; choose calendars in the planner")
            .put("systemBoundary","Sound files, keys and permission choices require the person. No secret values are exposed.");
    }
    private static int backupCount(Context c){java.io.File[] files=c.getFilesDir().listFiles((dir,name)->name.startsWith("companion-before-import-")&&name.endsWith(".json"));return files==null?0:files.length;}
    static JSONObject apply(Context c,JSONObject p)throws Exception {
        String action=p.getString("action"),message;
        switch(action){
            case "transparency":
                Object value=p.opt("value");if(!(value instanceof Integer)||((Integer)value)<0||((Integer)value)>70)throw new IllegalArgumentException("Transparency must be between 0 and 70 percent.");
                if(!c.getSharedPreferences(APPEARANCE,0).edit().putInt("transparency",(Integer)value).commit())throw new IllegalStateException("The appearance could not be saved.");
                message="Widget transparency set to "+value+"%.";break;
            case "widget_text_scale":
                Object scale=p.opt("value");if(!(scale instanceof Integer)||((Integer)scale)<MIN_TEXT_SCALE||((Integer)scale)>MAX_TEXT_SCALE)throw new IllegalArgumentException("Widget text size must be between 80 and 160 percent.");
                if(!c.getSharedPreferences(APPEARANCE,0).edit().putInt("widget-text-scale",(Integer)scale).commit())throw new IllegalStateException("The text size could not be saved.");
                message="Widget text size set to "+scale+"%.";break;
            case "show_butterfly":
                if(!Settings.canDrawOverlays(c))throw new IllegalStateException("Allow the floating butterfly in Android Settings first.");
                c.startForegroundService(new Intent(c,ButterflyService.class));message="Butterfly started. Leave RPM to see it.";break;
            case "hide_butterfly":c.stopService(new Intent(c,ButterflyService.class));message="Butterfly hidden.";break;
            default:throw new IllegalArgumentException("Unsupported app control.");
        }
        return new JSONObject().put("message",message);
    }
}

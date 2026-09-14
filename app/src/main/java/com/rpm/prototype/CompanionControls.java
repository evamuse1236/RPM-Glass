package com.rpm.prototype;

import android.content.*;
import android.provider.Settings;
import org.json.*;

/** Small allowlist of non-secret app controls shared with conversational capture. */
final class CompanionControls {
    static JSONObject read(Context c)throws JSONException {
        return new JSONObject().put("transparency",c.getSharedPreferences("companion-appearance",0).getInt("transparency",28))
            .put("alarmSound",AlertSounds.alarmName(c)).put("reminderSound",AlertSounds.reminderName(c,CompanionAlerts.REMINDERS))
            .put("aiConnected",CompanionKey.has(c)).put("notificationsAllowed",CompanionAlerts.notifications(c,CompanionAlerts.REMINDERS))
            .put("exactAlarmsAllowed",CompanionAlerts.exact(c)).put("overlayAllowed",Settings.canDrawOverlays(c))
            .put("calendarAccess","Read-only; choose calendars in the planner")
            .put("systemBoundary","Sound files, keys and permission choices require the person. No secret values are exposed.");
    }
    static JSONObject apply(Context c,JSONObject p)throws Exception {
        String action=p.getString("action"),message;
        switch(action){
            case "transparency":
                Object value=p.opt("value");if(!(value instanceof Integer)||((Integer)value)<0||((Integer)value)>70)throw new IllegalArgumentException("Transparency must be between 0 and 70 percent.");
                if(!c.getSharedPreferences("companion-appearance",0).edit().putInt("transparency",(Integer)value).commit())throw new IllegalStateException("The appearance could not be saved.");
                message="Widget transparency set to "+value+"%.";break;
            case "show_butterfly":
                if(!Settings.canDrawOverlays(c))throw new IllegalStateException("Allow the floating butterfly in Android Settings first.");
                c.startForegroundService(new Intent(c,ButterflyService.class));message="Butterfly started. Leave RPM to see it.";break;
            case "hide_butterfly":c.stopService(new Intent(c,ButterflyService.class));message="Butterfly hidden.";break;
            default:throw new IllegalArgumentException("Unsupported app control.");
        }
        return new JSONObject().put("message",message);
    }
}

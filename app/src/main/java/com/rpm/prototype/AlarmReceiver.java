package com.rpm.prototype;
import android.content.*;
import org.json.JSONObject;

public final class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent intent){
        if(!"com.rpm.ALARM".equals(intent.getAction())){Alarms.restore(c,false);return;}
        long id=intent.getLongExtra("id",-1);
        try(Store s=new Store(c)){
            JSONObject e=s.get(id);if(!e.optString("alarm_status").equals("scheduled")||e.optLong("alarm")>System.currentTimeMillis()+1000)return;
            if(!Alarms.notificationsAllowed(c)){ContentValues v=new ContentValues();v.put("alarm_status","blocked");s.update(id,v,"Alarm notification permission or channel disabled; did not start unmanageable ringing");return;}
            try{c.startForegroundService(new Intent(c,AlarmService.class).setAction("RING").putExtra("id",id));}
            catch(RuntimeException ex){ContentValues v=new ContentValues();v.put("alarm_status","blocked");s.update(id,v,"Android did not allow the alarm service to start");}
        }catch(IllegalArgumentException ignored){}
    }
}

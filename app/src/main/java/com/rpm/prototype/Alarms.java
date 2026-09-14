package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.os.Build;
import android.net.Uri;
import org.json.JSONObject;

final class Alarms {
    static final String CHANNEL="rpm_ringing_alarms";
    static void channel(Context c){NotificationChannel channel=new NotificationChannel(CHANNEL,"Ringing alarms",NotificationManager.IMPORTANCE_HIGH);channel.setDescription("Alarm clock alerts with local ringing, snooze and dismiss controls");channel.setSound(null,null);channel.enableVibration(false);c.getSystemService(NotificationManager.class).createNotificationChannel(channel);}
    static boolean exactAllowed(Context c){return Build.VERSION.SDK_INT<31||c.getSystemService(AlarmManager.class).canScheduleExactAlarms();}
    static boolean notificationsAllowed(Context c){channel(c);return (Build.VERSION.SDK_INT<33||c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED)&&c.getSystemService(NotificationManager.class).areNotificationsEnabled()&&c.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL).getImportance()!=NotificationManager.IMPORTANCE_NONE;}
    static boolean fullScreenAllowed(Context c){return Build.VERSION.SDK_INT<34||c.getSystemService(NotificationManager.class).canUseFullScreenIntent();}
    static PendingIntent trigger(Context c,long id){Intent i=new Intent(c,AlarmReceiver.class).setAction("com.rpm.ALARM").setData(Uri.parse("rpm://alarm/"+id)).putExtra("id",id);return PendingIntent.getBroadcast(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static PendingIntent open(Context c,long id){Intent i=new Intent(c,AlarmActivity.class).setData(Uri.parse("rpm://ringing/"+id)).putExtra("id",id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP);return PendingIntent.getActivity(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static void schedule(Context c,long id,long at){
        if(!exactAllowed(c))throw new SecurityException("Alarm permission required");
        Intent show=new Intent(c,MainActivity.class).putExtra("entry",id).setData(Uri.parse("rpm://alarm-details/"+id));
        PendingIntent details=PendingIntent.getActivity(c,0,show,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        c.getSystemService(AlarmManager.class).setAlarmClock(new AlarmManager.AlarmClockInfo(at,details),trigger(c,id));
    }
    static void cancel(Context c,long id){c.getSystemService(AlarmManager.class).cancel(trigger(c,id));if(AlarmService.running)c.startService(new Intent(c,AlarmService.class).setAction("STOP").putExtra("id",id));}
    static void restore(Context c,boolean boot){
        try(Store s=new Store(c)){
            for(JSONObject e:s.query("SELECT * FROM entries WHERE alarm IS NOT NULL AND alarm_status IN ('scheduled','permission_needed','ringing')",null)){
                long id=e.optLong("_id"),at=e.optLong("alarm");String status=e.optString("alarm_status");
                if(status.equals("ringing")){
                    if(boot||!AlarmService.running){ContentValues v=new ContentValues();v.put("alarm_status","interrupted");s.update(id,v,"Alarm ringing interrupted; not replayed");}continue;
                }
                if(at<=System.currentTimeMillis()){if(!boot&&at>System.currentTimeMillis()-5*60*1000)continue;ContentValues v=new ContentValues();v.put("alarm_status","missed");s.update(id,v,"Alarm time passed while app unavailable; not replayed");continue;}
                if(exactAllowed(c)){
                    schedule(c,id,at);if(status.equals("permission_needed")){ContentValues v=new ContentValues();v.put("alarm_status","scheduled");s.update(id,v,"Previously requested alarm restored after permission granted");}
                }else if(!status.equals("permission_needed")){ContentValues v=new ContentValues();v.put("alarm_status","permission_needed");s.update(id,v,"Alarm permission unavailable; alarm not scheduled");}
            }
        }
    }
}

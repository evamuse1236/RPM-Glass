package com.rpm.prototype;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.JSONObject;

final class Reminders {
    static final String CHANNEL="rpm_reminders";
    static void channel(Context c) {NotificationChannel channel=new NotificationChannel(CHANNEL,"Gentle reminders",NotificationManager.IMPORTANCE_DEFAULT);channel.setDescription("Local notification reminders. Timing may be delayed by Android.");c.getSystemService(NotificationManager.class).createNotificationChannel(channel);}
    static boolean permitted(Context c) {
        channel(c); NotificationManager nm=c.getSystemService(NotificationManager.class);
        return (Build.VERSION.SDK_INT<33||c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
            && nm.areNotificationsEnabled() && nm.getNotificationChannel(CHANNEL).getImportance()!=NotificationManager.IMPORTANCE_NONE;
    }
    static PendingIntent intent(Context c,long id) {
        Intent i=new Intent(c,ReminderReceiver.class).setAction("com.rpm.REMIND").setData(android.net.Uri.parse("rpm://reminder/"+id)).putExtra("id",id);
        return PendingIntent.getBroadcast(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
    static void schedule(Context c,long id,long at) {
        c.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,intent(c,id));
    }
    static void cancel(Context c,long id) {c.getSystemService(AlarmManager.class).cancel(intent(c,id));c.getSystemService(NotificationManager.class).cancel((int)id);}
    static void restore(Context c) { restore(c, false); }
    static void restore(Context c, boolean afterBoot) {
        try(Store store=new Store(c)) {
            for(JSONObject e:store.query("SELECT * FROM entries WHERE reminder IS NOT NULL AND reminder_status='scheduled' AND done=0",null)) {
                long id=e.optLong("_id"), at=e.optLong("reminder");
                if(at>System.currentTimeMillis()) schedule(c,id,at);
                else if(afterBoot) {ContentValues v=new ContentValues();v.put("reminder_status","missed");store.update(id,v,"Scheduled time passed while app could not deliver; not replayed");}
            }
        }
    }
}

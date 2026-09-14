package com.rpm.prototype;
import android.app.*;
import android.content.*;
import org.json.JSONObject;

public final class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent intent) {
        if(!"com.rpm.REMIND".equals(intent.getAction())) { boolean boot=Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction());Reminders.restore(c,boot);Alarms.restore(c,boot);SyncManager.request(c);return; }
        long id=intent.getLongExtra("id",-1);
        try(Store s=new Store(c)) {
            JSONObject e=s.get(id);
            if(!e.optString("reminder_status").equals("scheduled")||e.optInt("done")==1)return;
            // Ignore an old broadcast after the user moves the reminder into the future.
            if(e.optLong("reminder")>System.currentTimeMillis()+1000)return;
            boolean allowed=Reminders.permitted(c);
            if(allowed) {
                Intent open=new Intent(c,MainActivity.class).putExtra("entry",id).setData(android.net.Uri.parse("rpm://entry/"+id));
                PendingIntent p=PendingIntent.getActivity(c,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
                Notification n=new Notification.Builder(c,Reminders.CHANNEL).setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(e.optString("title")).setContentText("A gentle reminder · tap to open RPM")
                    .setStyle(new Notification.BigTextStyle().bigText(e.optString("title"))).setContentIntent(p).setAutoCancel(true).build();
                c.getSystemService(NotificationManager.class).notify((int)id,n);
            }
            ContentValues v=new ContentValues();v.put("reminder_status",allowed?"posted":"blocked");s.update(id,v,allowed?"Notification posted to Android; visibility not guaranteed":"Notifications disabled at delivery time");
        } catch(IllegalArgumentException ignored) { /* Entry no longer exists. */ }
    }
}

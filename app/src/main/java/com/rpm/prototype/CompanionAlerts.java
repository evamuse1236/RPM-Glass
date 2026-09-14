package com.rpm.prototype;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import org.json.*;
import java.time.*;
import java.util.*;

/** Native delivery ledger, separate from AI-editable records and legacy cloud storage. */
final class CompanionAlerts {
    static final String REMINDERS="companion_reminders",ALARMS="companion_alarms";
    static final String FIRE="com.rpm.prototype.COMPANION_FIRE";
    static void channels(Context c){NotificationManager n=c.getSystemService(NotificationManager.class);if(n.getNotificationChannel(REMINDERS)==null){NotificationChannel r=new NotificationChannel(REMINDERS,"RPM reminders",NotificationManager.IMPORTANCE_DEFAULT);r.setDescription("Gentle reminders. Android may delay delivery.");n.createNotificationChannel(r);}if(n.getNotificationChannel(ALARMS)==null){NotificationChannel a=new NotificationChannel(ALARMS,"RPM ringing alarms",NotificationManager.IMPORTANCE_HIGH);a.setSound(null,null);a.setDescription("Ringing alarms play using your phone's alarm volume.");n.createNotificationChannel(a);}}
    static boolean notifications(Context c,String channel){NotificationManager n=c.getSystemService(NotificationManager.class);NotificationChannel current=n.getNotificationChannel(channel);if(current==null){channels(c);current=n.getNotificationChannel(channel);}return n.areNotificationsEnabled()&&(Build.VERSION.SDK_INT<33||c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)&&current!=null&&current.getImportance()!=NotificationManager.IMPORTANCE_NONE;}
    static boolean exact(Context c){return Build.VERSION.SDK_INT<31||c.getSystemService(AlarmManager.class).canScheduleExactAlarms();}
    static JSONObject ledger(Context c){try{return new JSONObject(c.getSharedPreferences("companion-delivery",0).getString("ledger","{}"));}catch(JSONException e){return new JSONObject();}}
    static void persist(Context c,JSONObject ledger){SharedPreferences prefs=c.getSharedPreferences("companion-delivery",0);String value=ledger.toString();if(value.equals(prefs.getString("ledger","{}")))return;if(!prefs.edit().putString("ledger",value).commit())throw new IllegalStateException("Could not save delivery status.");}
    static String type(JSONObject e){JSONObject intent=e.optJSONObject("alertIntent"),alert=e.optJSONObject("alert");String type=intent==null?"":intent.optString("type","");if(type.isEmpty()||type.equals("null"))type=alert==null?"":alert.optString("type","");return type.equals("alarm")?"alarm":type.equals("reminder")?"reminder":"";}
    static long planned(JSONObject e){try{return Instant.parse(e.getString("planned")).toEpochMilli();}catch(Exception ignored){return 0;}}
    static String fingerprint(JSONObject e){return String.join("|",String.valueOf(planned(e)),type(e),e.optString("recurrence",""),e.optString("completedOccurrences","[]"),String.valueOf(e.optBoolean("archived")),String.valueOf(e.optBoolean("done")),e.optString("state","active"));}
    static boolean active(JSONObject e){return !e.optBoolean("archived")&&!e.optBoolean("done")&&!e.optString("state").equals("cancelled")&&!type(e).isEmpty();}
    static JSONObject entry(JSONObject d,long id){JSONArray a=d.optJSONArray("entries");if(a!=null)for(int i=0;i<a.length();i++){JSONObject e=a.optJSONObject(i);if(e!=null&&e.optLong("id")==id)return e;}return null;}
    static PendingIntent trigger(Context c,long id,long at){Intent i=new Intent(c,CompanionAlertReceiver.class).setAction(FIRE).setData(Uri.parse("rpm-companion://alert/"+id)).putExtra("id",id).putExtra("at",at);return PendingIntent.getBroadcast(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static PendingIntent open(Context c,long id){return PendingIntent.getActivity(c,(int)(id%Integer.MAX_VALUE),new Intent(c,CompanionActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static void cancel(Context c,long id){c.getSystemService(AlarmManager.class).cancel(trigger(c,id,0));c.getSystemService(NotificationManager.class).cancel("companion-reminder",(int)id);CompanionAlarmService.cancelActive(id);}
    static long next(long base,String recurrence,ZoneId zone,long now){
        if(base<=0)return 0;if(base>now){ZonedDateTime start=Instant.ofEpochMilli(base).atZone(zone);while(recurrence.equals("weekdays")&&start.getDayOfWeek().getValue()>5)start=start.plusDays(1);return start.toInstant().toEpochMilli();}
        if(!Arrays.asList("daily","weekly","weekdays").contains(recurrence))return 0;
        ZonedDateTime time=Instant.ofEpochMilli(base).atZone(zone);long step=recurrence.equals("weekly")?7:1;
        long days=java.time.temporal.ChronoUnit.DAYS.between(time.toLocalDate(),Instant.ofEpochMilli(now).atZone(zone).toLocalDate());
        time=time.plusDays(Math.max(0,days/step)*step);
        while(time.toInstant().toEpochMilli()<=now||recurrence.equals("weekdays")&&time.getDayOfWeek().getValue()>5)time=time.plusDays(step);
        return time.toInstant().toEpochMilli();
    }
    static long next(JSONObject e,ZoneId zone,long now){
        long at=next(planned(e),e.optString("recurrence"),zone,now);Set<Long> completed=new HashSet<>();JSONArray rows=e.optJSONArray("completedOccurrences");
        if(rows!=null)for(int i=0;i<rows.length();i++)try{completed.add(Instant.parse(rows.getString(i)).toEpochMilli());}catch(Exception ignored){}
        for(int i=0;i<=completed.size()&&at>0&&completed.contains(at);i++)at=next(planned(e),e.optString("recurrence"),zone,at);
        return at;
    }
    static void reconcile(Context c,JSONObject d,boolean force)throws Exception{synchronized(CompanionStore.LOCK){
        channels(c);boolean reminderAllowed=notifications(c,REMINDERS),alarmAllowed=notifications(c,ALARMS)&&exact(c);JSONObject l=ledger(c);Set<String> ids=new HashSet<>();JSONArray entries=d.getJSONArray("entries");
        for(int i=0;i<entries.length();i++){
            JSONObject e=entries.getJSONObject(i);String id=String.valueOf(e.getLong("id"));ids.add(id);String fp=fingerprint(e);JSONObject old=l.optJSONObject(id);
            boolean changed=old==null||!fp.equals(old.optString("fingerprint"));
            if(old!=null&&old.optBoolean("importedDisarmed")){cancel(c,e.getLong("id"));old.put("fingerprint",fp).put("status",active(e)?"imported_not_armed":"off").put("label",active(e)?"Imported · not armed on this phone":"Alert off · imported copy remains disarmed");continue;}
            if(old!=null&&!changed&&Arrays.asList("scheduled","snoozed").contains(old.optString("status"))&&!(type(e).equals("alarm")?alarmAllowed:reminderAllowed)){cancel(c,e.getLong("id"));old.put("status","permission_needed").put("label","Not scheduled · phone alert permission is missing");continue;}
            if(old!=null&&old.optString("status").equals("ringing")&&CompanionAlarmService.activeIds().contains(e.getLong("id"))&&!changed)continue;
            if(!changed&&!force&&!old.optString("status").equals("permission_needed"))continue;
            if(!changed&&force&&Arrays.asList("posted","dismissed","missed","stopped").contains(old.optString("status"))&&!Arrays.asList("daily","weekly","weekdays").contains(e.optString("recurrence")))continue;
            // A resume does not dismiss a ringing alarm or erase its snooze.
            if(!changed&&Arrays.asList("ringing","snoozed").contains(old.optString("status"))&&!force)continue;
            cancel(c,e.getLong("id"));JSONObject row=new JSONObject().put("fingerprint",fp).put("type",type(e));l.put(id,row);
            if(!active(e)){row.put("status","off").put("label","Alert off");continue;}
            long base=planned(e);long at=next(e,ZoneId.systemDefault(),System.currentTimeMillis());
            if(base==0){row.put("status","time_needed").put("label","Not scheduled · add a time");continue;}
            if(at==0){row.put("status","missed").put("label","Time passed · not scheduled");continue;}
            if(!changed&&old.optLong("snoozeAt")>System.currentTimeMillis()){at=old.optLong("snoozeAt");row.put("snoozeAt",at);}
            schedule(c,e,row,at);
        }
        for(Iterator<String> it=l.keys();it.hasNext();){String id=it.next();if(!ids.contains(id)){cancel(c,Long.parseLong(id));it.remove();}}
        persist(c,l);
    }}
    static void schedule(Context c,JSONObject e,JSONObject row,long at)throws JSONException{
        String type=type(e);row.put("at",at);
        if(!notifications(c,type.equals("alarm")?ALARMS:REMINDERS)||type.equals("alarm")&&!exact(c)){row.put("status","permission_needed").put("label",type.equals("alarm")?"Not scheduled · allow notifications and exact alarms":"Not scheduled · allow notifications");return;}
        try{AlarmManager am=c.getSystemService(AlarmManager.class);long id=e.getLong("id");PendingIntent pi=trigger(c,id,at);
            if(type.equals("alarm"))am.setAlarmClock(new AlarmManager.AlarmClockInfo(at,open(c,id)),pi);else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi);
            String when=java.time.format.DateTimeFormatter.ofPattern("EEE, h:mm a").format(Instant.ofEpochMilli(at).atZone(ZoneId.systemDefault()));row.put("status",row.has("snoozeAt")?"snoozed":"scheduled").put("label",type.equals("alarm")?"Alarm scheduled · "+when:"Reminder scheduled · "+when+" · may be delayed");
        }catch(RuntimeException failure){row.put("status","failed").put("label","Android could not schedule this alert. Check Settings and retry.");}
    }
    static void restore(Context c){try{synchronized(CompanionStore.LOCK){JSONObject d=CompanionStore.read(c);if(d!=null)reconcile(c,d,true);}}catch(Exception ignored){/* Data remains intact; activity exposes load errors. */}}
    static void disarmImport(Context c,JSONObject d)throws Exception{JSONObject l=new JSONObject();JSONArray a=d.getJSONArray("entries");for(int i=0;i<a.length();i++){JSONObject e=a.getJSONObject(i);l.put(String.valueOf(e.getLong("id")),new JSONObject().put("fingerprint",fingerprint(e)).put("importedDisarmed",true).put("status","imported_not_armed").put("label","Imported · not armed on this phone"));}persist(c,l);}
    static void arm(Context c,long id)throws Exception{synchronized(CompanionStore.LOCK){JSONObject l=ledger(c);l.remove(String.valueOf(id));persist(c,l);JSONObject d=CompanionStore.read(c);if(d!=null)reconcile(c,d,false);}}
    static void cancelAll(Context c){JSONObject l=ledger(c);for(Iterator<String> it=l.keys();it.hasNext();)cancel(c,Long.parseLong(it.next()));}
    static JSONObject status(Context c)throws JSONException{channels(c);JSONObject out=new JSONObject().put("fontScale",c.getResources().getConfiguration().fontScale).put("hasKey",CompanionKey.has(c)).put("exact",exact(c)).put("notifications",notifications(c,REMINDERS)).put("overlay",android.provider.Settings.canDrawOverlays(c)).put("delivery",ledger(c));return out;}
    static void fired(Context c,long id,long expected)throws Exception{synchronized(CompanionStore.LOCK){JSONObject d=CompanionStore.read(c);if(d==null)return;JSONObject e=entry(d,id),l=ledger(c),r=l.optJSONObject(String.valueOf(id));if(e==null||r==null||!active(e)||!fingerprint(e).equals(r.optString("fingerprint"))||r.optLong("at")!=expected||!Arrays.asList("scheduled","snoozed").contains(r.optString("status")))return;
        // Ignore stale/cancelled broadcasts; never report a notification as delivered before notify().
        if(!notifications(c,type(e).equals("alarm")?ALARMS:REMINDERS)){r.put("status","permission_needed").put("label","Blocked by notification settings");persist(c,l);return;}
        if(type(e).equals("alarm")){r.put("status","ringing").put("label","Alarm ringing");persist(c,l);try{c.startForegroundService(new Intent(c,CompanionAlarmService.class).setAction("ring").putExtra("id",id));}catch(RuntimeException failure){finish(c,id,false,"Alarm could not start · open RPM");}return;}
        Notification n=new Notification.Builder(c,REMINDERS).setSmallIcon(R.drawable.ic_checkin).setContentTitle(e.optString("title","RPM reminder")).setContentText("Your RPM reminder").setContentIntent(open(c,id)).setAutoCancel(true).setCategory(Notification.CATEGORY_REMINDER).build();c.getSystemService(NotificationManager.class).notify("companion-reminder",(int)id,n);finish(c,id,false,"Reminder posted");
    }}
    static void finish(Context c,long id,boolean snooze,String label)throws Exception{synchronized(CompanionStore.LOCK){JSONObject d=CompanionStore.read(c);if(d==null)return;JSONObject e=entry(d,id),l=ledger(c),r=l.optJSONObject(String.valueOf(id));if(e==null||r==null)return;
        r.remove("snoozeAt");if(snooze&&active(e)){long at=System.currentTimeMillis()+600000;r.put("snoozeAt",at);schedule(c,e,r,at);}else{
            r.put("status",label.equals("Reminder posted")?"posted":"dismissed").put("label",label);long next=next(e,ZoneId.systemDefault(),Math.max(System.currentTimeMillis(),r.optLong("at")));
            if(next>0&&active(e)){schedule(c,e,r,next);r.put("label",label+" · next "+r.optString("label"));}
        }persist(c,l);
    }}
}

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
    static final String REMINDERS="companion_reminders",ALARMS="companion_alarms",ALARMS_QUIET="companion_alarms_notch";
    static final String FIRE="com.rpm.prototype.COMPANION_FIRE";
    static void channels(Context c){NotificationManager n=c.getSystemService(NotificationManager.class);if(n.getNotificationChannel(REMINDERS)==null){NotificationChannel r=new NotificationChannel(REMINDERS,"RPM reminders",NotificationManager.IMPORTANCE_DEFAULT);r.setDescription("Gentle reminders. Android may delay delivery.");n.createNotificationChannel(r);}if(n.getNotificationChannel(ALARMS)==null){NotificationChannel a=new NotificationChannel(ALARMS,"RPM ringing alarms",NotificationManager.IMPORTANCE_HIGH);a.setSound(null,null);a.setDescription("Ringing alarms play using your phone's alarm volume.");n.createNotificationChannel(a);}if(n.getNotificationChannel(ALARMS_QUIET)==null){NotificationChannel q=new NotificationChannel(ALARMS_QUIET,"RPM alarms shown in the notch",NotificationManager.IMPORTANCE_LOW);q.setSound(null,null);q.setDescription("A ringing alarm while the notch shows it. It still rings at your alarm volume.");n.createNotificationChannel(q);}}
    static boolean notifications(Context c,String channel){NotificationManager n=c.getSystemService(NotificationManager.class);NotificationChannel current=n.getNotificationChannel(channel);if(current==null){channels(c);current=n.getNotificationChannel(channel);}return n.areNotificationsEnabled()&&(Build.VERSION.SDK_INT<33||c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)&&current!=null&&current.getImportance()!=NotificationManager.IMPORTANCE_NONE;}
    static boolean exact(Context c){return Build.VERSION.SDK_INT<31||c.getSystemService(AlarmManager.class).canScheduleExactAlarms();}
    static JSONObject ledger(Context c){try{return new JSONObject(c.getSharedPreferences("companion-delivery",0).getString("ledger","{}"));}catch(JSONException e){return new JSONObject();}}
    static void persist(Context c,JSONObject ledger){SharedPreferences prefs=c.getSharedPreferences("companion-delivery",0);String value=ledger.toString();if(value.equals(prefs.getString("ledger","{}")))return;if(!prefs.edit().putString("ledger",value).commit())throw new IllegalStateException("Could not save delivery status.");}
    static String type(JSONObject e){return NotchData.alertType(e);}
    static long planned(JSONObject e){try{return Instant.parse(e.getString("planned")).toEpochMilli();}catch(Exception ignored){return 0;}}
    /** The fingerprint's leading part: when the alert is due (time, type, repeat, lead), apart from completion and status. */
    static String when(JSONObject e){return String.join("|",String.valueOf(planned(e)),type(e),Repeats.key(e),String.valueOf(Repeats.lead(e)));}
    static String fingerprint(JSONObject e){return String.join("|",when(e),e.optString("completedOccurrences","[]"),String.valueOf(e.optBoolean("archived")),String.valueOf(e.optBoolean("done")),e.optString("state","active"));}
    static boolean active(JSONObject e){return !e.optBoolean("archived")&&!e.optBoolean("done")&&!e.optString("state").equals("cancelled")&&!type(e).isEmpty();}
    static JSONObject entry(JSONObject d,long id){JSONArray a=d.optJSONArray("entries");if(a!=null)for(int i=0;i<a.length();i++){JSONObject e=a.optJSONObject(i);if(e!=null&&e.optLong("id")==id)return e;}return null;}
    static PendingIntent trigger(Context c,long id,long at){Intent i=new Intent(c,CompanionAlertReceiver.class).setAction(FIRE).setData(Uri.parse("rpm-companion://alert/"+id)).putExtra("id",id).putExtra("at",at);return PendingIntent.getBroadcast(c,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static PendingIntent open(Context c,long id){return PendingIntent.getActivity(c,(int)(id%Integer.MAX_VALUE),new Intent(c,CompanionActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static void cancel(Context c,long id){cancelTrigger(c,id);c.getSystemService(NotificationManager.class).cancel("companion-reminder",(int)id);}
    /** Disarms the alert and stops a ring but leaves a posted reminder in the shade. */
    static void cancelTrigger(Context c,long id){c.getSystemService(AlarmManager.class).cancel(trigger(c,id,0));CompanionAlarmService.cancelActive(id);}
    static long next(long base,String recurrence,ZoneId zone,long now){
        if(base<=0)return 0;if(base>now){ZonedDateTime start=Instant.ofEpochMilli(base).atZone(zone);for(int i=0;i<7&&Repeats.repeating(recurrence)&&!Repeats.on(recurrence,start.getDayOfWeek());i++)start=start.plusDays(1);if(Repeats.repeating(recurrence))start=start.withEarlierOffsetAtOverlap();return start.toInstant().toEpochMilli();}
        if(!Repeats.repeating(recurrence))return 0;
        ZonedDateTime start=Instant.ofEpochMilli(base).atZone(zone);long step=Repeats.step(recurrence);
        long days=java.time.temporal.ChronoUnit.DAYS.between(start.toLocalDate(),Instant.ofEpochMilli(now).atZone(zone).toLocalDate());
        // Each step counts from base, so a day whose clock time does not exist (moved to 3:30) never shifts the days after it.
        // A clock time that happens twice (fall-back) takes the first one, as the planner's Date does.
        long first=Math.max(0,days/step);ZonedDateTime time=start.plusDays(first*step).withEarlierOffsetAtOverlap();
        for(int i=0;i<800&&(time.toInstant().toEpochMilli()<=now||!Repeats.on(recurrence,time.getDayOfWeek()));i++)time=start.plusDays((first+i+1)*step).withEarlierOffsetAtOverlap();
        return time.toInstant().toEpochMilli();
    }
    static long next(JSONObject e,ZoneId zone,long now){
        String repeat=Repeats.key(e);long at=next(planned(e),repeat,zone,now);Set<Long> completed=completed(e);
        for(int i=0;i<=completed.size()&&at>0&&completed.contains(at);i++)at=next(planned(e),repeat,zone,at);
        return at;
    }
    static Set<Long> completed(JSONObject e){Set<Long> completed=new HashSet<>();JSONArray rows=e.optJSONArray("completedOccurrences");
        if(rows!=null)for(int i=0;i<rows.length();i++)try{completed.add(Instant.parse(rows.getString(i)).toEpochMilli());}catch(Exception ignored){}
        return completed;
    }
    static void reconcile(Context c,JSONObject d,boolean force)throws Exception{synchronized(CompanionStore.LOCK){
        channels(c);boolean reminderAllowed=notifications(c,REMINDERS),alarmAllowed=notifications(c,ALARMS)&&exact(c);JSONObject l=ledger(c);Set<String> ids=new HashSet<>();JSONArray entries=d.getJSONArray("entries");
        for(int i=0;i<entries.length();i++){
            JSONObject e=entries.getJSONObject(i);String id=String.valueOf(e.getLong("id"));ids.add(id);String fp=fingerprint(e);JSONObject old=l.optJSONObject(id);
            boolean changed=old==null||!fp.equals(old.optString("fingerprint"));
            if(old!=null&&old.optBoolean("importedDisarmed")){cancel(c,e.getLong("id"));old.put("fingerprint",fp).put("status",active(e)?"imported_not_armed":"off").put("label",active(e)?"Imported · not armed on this phone":"Alert off · imported copy remains disarmed");continue;}
            if(old!=null&&!changed&&Arrays.asList("scheduled","snoozed").contains(old.optString("status"))&&!(type(e).equals("alarm")?alarmAllowed:reminderAllowed)){cancel(c,e.getLong("id"));old.put("status","permission_needed").put("label","Not scheduled · phone alert permission is missing");continue;}
            if(old!=null&&old.optString("status").equals("ringing")&&CompanionAlarmService.activeIds().contains(e.getLong("id"))&&!changed)continue;
            // Ringing with no service holding it for over a minute: the process died mid-ring, so finish it and arm the next occurrence.
            boolean interrupted=!changed&&old.optString("status").equals("ringing")&&System.currentTimeMillis()-old.optLong("ringingSince",old.optLong("at"))>60000;
            if(!changed&&!force&&!interrupted&&!old.optString("status").equals("permission_needed"))continue;
            if(!changed&&force&&Arrays.asList("posted","dismissed","missed","stopped").contains(old.optString("status"))&&!Repeats.repeating(Repeats.key(e)))continue;
            // A resume does not dismiss a ringing alarm or erase its snooze.
            if(!changed&&Arrays.asList("ringing","snoozed").contains(old.optString("status"))&&!force&&!interrupted)continue;
            // A row whose time is unchanged keeps the occurrence whose alert already sounded, so an Undo of a completion or a change of repeat, lead or type does not sound it again.
            boolean sameTime=old!=null&&old.optString("fingerprint").startsWith(planned(e)+"|");
            // A first ring cut off while its occurrence is still ahead and not done rings again; one whose occurrence passed, or a snoozed ring, is finished.
            long ringOcc=changed?0:occurrence(old);boolean replay=!changed&&old.optString("status").equals("ringing")&&!old.has("snoozeAt")&&ringOcc>System.currentTimeMillis()&&!completed(e).contains(ringOcc);
            // A reminder that posted, switched to an alarm whose time is still ahead, rings: the user asked for it.
            boolean upgraded=old!=null&&type(e).equals("alarm")&&!"alarm".equals(old.optString("type"))&&old.optLong("sounded")-Repeats.lead(e)*60000L>System.currentTimeMillis();
            long sounded=sameTime&&!upgraded?old.optLong("sounded"):0;if(replay)sounded=0;else if(interrupted)sounded=Math.max(sounded,occurrence(old));
            // A move keeps the exact occurrence that already sounded, so an Undo of the move does not sound it again; an earlier time still ahead is armed.
            long soundedBefore=old==null?0:!sameTime&&old.optLong("sounded")>0?old.optLong("sounded"):old.optLong("soundedBefore");
            // A live snooze outlasts a change that keeps the time (Done then Undo, a restore): it is held while its occurrence is done and comes back when that is undone.
            long base=planned(e),now=System.currentTimeMillis(),held=0,heldFor=0;if(old!=null&&(!changed||sounded>0)){held=old.optLong("snoozeAt",old.optLong("heldSnoozeAt"));heldFor=old.has("snoozeAt")?occurrence(old):old.optLong("heldOccurrence");}
            // A snooze whose time passed without ringing (the phone was off, or its broadcast was late) sounds now while its occurrence is still ahead.
            boolean snoozeDue=!changed&&old.optString("status").equals("snoozed")&&old.has("snoozeAt")&&held>0&&held<=now&&heldFor>now;if(snoozeDue)held=now;else if(held<=now)held=0;
            // An unchanged row (a restore or Check alerts) only re-arms: its reminder already posted stays in the shade.
            if(changed)cancel(c,e.getLong("id"));else cancelTrigger(c,e.getLong("id"));JSONObject row=new JSONObject().put("fingerprint",fp).put("type",type(e));l.put(id,row);if(sounded>0)row.put("sounded",sounded);if(soundedBefore>0)row.put("soundedBefore",soundedBefore);
            if(!active(e)){row.put("status","off").put("label","Alert off");if(held>0)row.put("heldSnoozeAt",held).put("heldOccurrence",heldFor);continue;}
            if(held>0&&base>0&&!completed(e).contains(heldFor)){row.put("snoozeAt",held).put("occurrence",heldFor);schedule(c,e,row,held);continue;}
            // An unchanged row keeps its stored occurrence: an occurrence whose alert already sounded is not armed again. A snoozed row's at is its snooze time, so its occurrence is kept apart.
            // After a time zone change the stored occurrence may no longer be one in this zone; then only what sounded holds it back, so today's occurrence here is still armed.
            ZoneId zone=ZoneId.systemDefault();long kept=changed?0:occurrence(old);boolean lined=kept>0&&next(base,Repeats.key(e),zone,kept-1)==kept;
            long at=next(e,zone,Math.max(lined?Math.max(now,kept-(interrupted?0:1)):now,sounded));if(at>0&&at==soundedBefore)at=next(e,ZoneId.systemDefault(),at);
            if(replay)at=ringOcc;
            if(base==0){row.put("status","time_needed").put("label","Not scheduled · add a time");continue;}
            if(at==0&&interrupted){row.put("status","dismissed").put("label","Alarm interrupted");continue;}
            if(at==0){row.put("status","missed").put("label","Time passed · not scheduled");continue;}
            if(held>0)row.put("heldSnoozeAt",held).put("heldOccurrence",heldFor);
            schedule(c,e,row,at);
        }
        for(Iterator<String> it=l.keys();it.hasNext();){String id=it.next();if(!ids.contains(id)){cancel(c,Long.parseLong(id));it.remove();}}
        persist(c,l);
    }}
    /** The occurrence a ledger row is for: a snooze moves its at but not its occurrence. */
    static long occurrence(JSONObject row){return row.optLong("occurrence",row.optLong("at"));}
    /** When an alert for the occurrence at {@code at} sounds: {@code lead} minutes before it, never in the past. */
    static long fireAt(long at,int lead,long now){return Math.max(Math.min(now,at),at-lead*60000L);}
    static void schedule(Context c,JSONObject e,JSONObject row,long at)throws JSONException{
        String type=type(e);row.put("at",at);
        if(!notifications(c,type.equals("alarm")?ALARMS:REMINDERS)||type.equals("alarm")&&!exact(c)){row.put("status","permission_needed").put("label",type.equals("alarm")?"Not scheduled · allow notifications and exact alarms":"Not scheduled · allow notifications");return;}
        try{AlarmManager am=c.getSystemService(AlarmManager.class);long id=e.getLong("id");PendingIntent pi=trigger(c,id,at);long fire=fireAt(at,row.has("snoozeAt")?0:Repeats.lead(e),System.currentTimeMillis());
            if(type.equals("alarm"))am.setAlarmClock(new AlarmManager.AlarmClockInfo(fire,open(c,id)),pi);else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,fire,pi);
            String when=java.time.format.DateTimeFormatter.ofPattern("EEE, h:mm a").format(Instant.ofEpochMilli(fire).atZone(ZoneId.systemDefault()));row.put("status",row.has("snoozeAt")?"snoozed":"scheduled").put("label",type.equals("alarm")?"Alarm scheduled · "+when:"Reminder scheduled · "+when+" · may be delayed");
        }catch(RuntimeException failure){row.put("status","failed").put("label","Android could not schedule this alert. Check Settings and retry.");}
    }
    /** Settings Check alerts: read and force-reconcile under one lock hold; errors reach the page. */
    static void check(Context c)throws Exception{synchronized(CompanionStore.LOCK){JSONObject d=CompanionStore.read(c);if(d!=null)reconcile(c,d,true);}}
    static void restore(Context c){try{synchronized(CompanionStore.LOCK){JSONObject d=CompanionStore.read(c);if(d!=null)reconcile(c,d,true);}}catch(Exception ignored){/* Data remains intact; activity exposes load errors. */}}
    static void disarmImport(Context c,JSONObject d)throws Exception{JSONObject l=new JSONObject();JSONArray a=d.getJSONArray("entries");for(int i=0;i<a.length();i++){JSONObject e=a.getJSONObject(i);l.put(String.valueOf(e.getLong("id")),new JSONObject().put("fingerprint",fingerprint(e)).put("importedDisarmed",true).put("status","imported_not_armed").put("label","Imported · not armed on this phone"));}persist(c,l);}
    static void arm(Context c,long id)throws Exception{synchronized(CompanionStore.LOCK){JSONObject l=ledger(c);l.remove(String.valueOf(id));persist(c,l);JSONObject d=CompanionStore.read(c);if(d!=null)reconcile(c,d,false);}}
    static void cancelAll(Context c){JSONObject l=ledger(c);for(Iterator<String> it=l.keys();it.hasNext();)cancel(c,Long.parseLong(it.next()));}
    static JSONObject status(Context c)throws JSONException{return status(c,false);}
    static JSONObject status(Context c,boolean widget)throws JSONException{channels(c);float systemScale=c.getResources().getConfiguration().fontScale,effectiveScale=systemScale*(widget?CompanionControls.widgetTextScale(c)/100f:1f);JSONObject out=new JSONObject().put("fontScale",systemScale).put("effectiveFontScale",effectiveScale).put("widgetTextScale",CompanionControls.widgetTextScale(c)).put("hasKey",CompanionKey.hasAny(c)).put("exact",exact(c)).put("notifications",notifications(c,REMINDERS)).put("overlay",android.provider.Settings.canDrawOverlays(c)).put("delivery",ledger(c));return out;}
    static void fired(Context c,long id,long expected)throws Exception{synchronized(CompanionStore.LOCK){JSONObject d=CompanionStore.read(c);if(d==null)return;JSONObject e=entry(d,id),l=ledger(c),r=l.optJSONObject(String.valueOf(id));if(e==null||r==null||!active(e)||!fingerprint(e).equals(r.optString("fingerprint"))||r.optLong("at")!=expected||!Arrays.asList("scheduled","snoozed").contains(r.optString("status")))return;
        // Ignore stale/cancelled broadcasts; never report a notification as delivered before notify().
        if(!notifications(c,type(e).equals("alarm")?ALARMS:REMINDERS)){r.put("status","permission_needed").put("label","Blocked by notification settings");persist(c,l);return;}
        // A ringing alarm records its occurrence as sounded, so Done then Undo, or alert off then on, while it rings does not ring it again.
        if(type(e).equals("alarm")){r.put("sounded",Math.max(r.optLong("sounded"),occurrence(r))).put("status","ringing").put("label","Alarm ringing").put("ringingSince",System.currentTimeMillis());persist(c,l);try{c.startForegroundService(new Intent(c,CompanionAlarmService.class).setAction("ring").putExtra("id",id));}catch(RuntimeException failure){finish(c,id,false,"Alarm could not start · open RPM");}return;}
        Notification n=new Notification.Builder(c,REMINDERS).setSmallIcon(R.drawable.ic_checkin).setContentTitle(e.optString("title","RPM reminder")).setContentText("Your RPM reminder").setContentIntent(open(c,id)).setAutoCancel(true).setCategory(Notification.CATEGORY_REMINDER).build();c.getSystemService(NotificationManager.class).notify("companion-reminder",(int)id,n);long occurrence=occurrence(r);finish(c,id,false,"Reminder posted");NotchAlerting.reminderFired(c,id,e.optString("title",e.optString("raw","RPM reminder")),expected,occurrence);
    }}
    static void finish(Context c,long id,boolean snooze,String label)throws Exception{synchronized(CompanionStore.LOCK){JSONObject d=CompanionStore.read(c);if(d==null)return;JSONObject e=entry(d,id),l=ledger(c),r=l.optJSONObject(String.valueOf(id));if(e==null||r==null)return;
        // A reminder is snoozed after it posted, when its row already holds the next occurrence: the snooze is for the one that sounded.
        long occurrence=snooze&&!r.optString("status").equals("ringing")&&r.optLong("sounded")>0?r.optLong("sounded"):occurrence(r);r.remove("snoozeAt");r.remove("occurrence");if(snooze&&active(e)){long at=System.currentTimeMillis()+600000;r.put("snoozeAt",at).put("occurrence",occurrence).put("sounded",Math.max(r.optLong("sounded"),occurrence));schedule(c,e,r,at);}else{
            r.put("status",label.equals("Reminder posted")?"posted":"dismissed").put("label",label).put("sounded",Math.max(r.optLong("sounded"),occurrence));long next=next(e,ZoneId.systemDefault(),Math.max(System.currentTimeMillis(),occurrence));
            if(next>0&&active(e)){schedule(c,e,r,next);r.put("label",label+" · next "+r.optString("label"));}
        }persist(c,l);
    }}
}

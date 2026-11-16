package com.rpm.prototype;

import android.app.*;
import android.content.Context;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import java.time.Instant;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=Application.class)
public class CompanionAlertsIdTest {
    @Test public void serverTaskIdsSchedulePostAndCancelIndependently()throws Exception {
        Context c=RuntimeEnvironment.getApplication();long id=1_000_000_007L,local=7,at=System.currentTimeMillis()+3600000;
        CompanionAlerts.channels(c);AlarmManager alarms=c.getSystemService(AlarmManager.class);NotificationManager notifications=c.getSystemService(NotificationManager.class);
        JSONArray entries=new JSONArray();JSONObject ledger=new JSONObject();
        for(long taskId:new long[]{local,id}){
            JSONObject e=new JSONObject().put("id",taskId).put("title","Task "+taskId).put("raw","Reminder").put("revisions",new JSONArray()).put("planned",Instant.ofEpochMilli(at).toString()).put("alertIntent",new JSONObject().put("type","reminder"));JSONObject row=new JSONObject();
            CompanionAlerts.schedule(c,e,row,at);assertEquals("scheduled",row.getString("status"));
            row.put("fingerprint",CompanionAlerts.fingerprint(e));entries.put(e);ledger.put(String.valueOf(taskId),row);
        }
        JSONObject data=new JSONObject().put("schema",2).put("version",1).put("entries",entries).put("memories",new JSONArray()).put("history",new JSONArray()).put("conversations",new JSONArray().put(new JSONObject()));
        CompanionStore.writeRaw(c,data);CompanionAlerts.persist(c,ledger);
        CompanionAlerts.fired(c,local,at);CompanionAlerts.fired(c,id,at);
        assertEquals("Task "+id,shadowOf(notifications).getNotification("companion-reminder",(int)id).extras.getString(Notification.EXTRA_TITLE));
        assertEquals(2,shadowOf(alarms).getScheduledAlarms().size());
        assertNotEquals(CompanionAlerts.trigger(c,local,at),CompanionAlerts.trigger(c,id,at));
        assertEquals(id,shadowOf(CompanionAlerts.trigger(c,id,at)).getSavedIntent().getLongExtra("id",0));
        assertNotEquals(shadowOf(CompanionAlerts.open(c,local)).getRequestCode(),shadowOf(CompanionAlerts.open(c,id)).getRequestCode());
        assertEquals((int)id,shadowOf(CompanionAlerts.open(c,id)).getRequestCode());
        CompanionAlerts.cancel(c,id);assertEquals(1,shadowOf(alarms).getScheduledAlarms().size());
        assertNull(shadowOf(notifications).getNotification("companion-reminder",(int)id));assertNotNull(shadowOf(notifications).getNotification("companion-reminder",(int)local));
        CompanionAlerts.cancel(c,local);assertEquals(0,shadowOf(alarms).getScheduledAlarms().size());
    }

    /** A daily task 20 min away with a 30 min lead: its alert is due now. */
    private static long leadAlertDueNow(Context c,long id,String type)throws Exception{
        long occurrence=(System.currentTimeMillis()/60000+20)*60000;CompanionAlerts.channels(c);
        JSONObject e=new JSONObject().put("id",id).put("title","Standup").put("raw","Standup").put("revisions",new JSONArray()).put("planned",Instant.ofEpochMilli(occurrence).toString()).put("recurrence","daily").put("alertIntent",new JSONObject().put("type",type).put("lead",30));
        JSONObject data=new JSONObject().put("schema",2).put("version",1).put("entries",new JSONArray().put(e)).put("memories",new JSONArray()).put("history",new JSONArray()).put("conversations",new JSONArray().put(new JSONObject()));
        CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertEquals(occurrence,CompanionAlerts.ledger(c).getJSONObject(String.valueOf(id)).getLong("at"));
        return occurrence;
    }
    @Test public void aRestoreAfterALeadAlertSoundedKeepsTomorrowsOccurrence()throws Exception {
        Context c=RuntimeEnvironment.getApplication();AlarmManager alarms=c.getSystemService(AlarmManager.class);
        long reminder=21,alarm=22,day=86400000L;
        long occurrence=leadAlertDueNow(c,reminder,"reminder");
        CompanionAlerts.fired(c,reminder,occurrence);
        assertEquals(occurrence+day,CompanionAlerts.ledger(c).getJSONObject("21").getLong("at"));
        CompanionAlerts.restore(c); // boot, app update, clock or zone change, Check alerts
        assertEquals("a restore must not re-arm today's reminder that already posted",occurrence+day,CompanionAlerts.ledger(c).getJSONObject("21").getLong("at"));
        assertTrue(shadowOf(alarms).getNextScheduledAlarm().triggerAtTime>System.currentTimeMillis()+60000);
        occurrence=leadAlertDueNow(c,alarm,"alarm");
        CompanionAlerts.finish(c,alarm,false,"Alarm dismissed");
        CompanionAlerts.restore(c);
        assertEquals("a restore must not ring a dismissed alarm again",occurrence+day,CompanionAlerts.ledger(c).getJSONObject("22").getLong("at"));
    }
    @Test public void aRestoreStillFiresALeadAlertThatNeverSounded()throws Exception {
        Context c=RuntimeEnvironment.getApplication();AlarmManager alarms=c.getSystemService(AlarmManager.class);
        long occurrence=leadAlertDueNow(c,23,"reminder");
        CompanionAlerts.restore(c); // the phone was off through the lead window
        assertEquals(occurrence,CompanionAlerts.ledger(c).getJSONObject("23").getLong("at"));
        assertTrue(shadowOf(alarms).getNextScheduledAlarm().triggerAtTime<=System.currentTimeMillis()+1000);
    }
    @Test public void dismissingASnoozedLeadAlarmArmsTomorrowNotTodayAgain()throws Exception {
        Context c=RuntimeEnvironment.getApplication();AlarmManager alarms=c.getSystemService(AlarmManager.class);long day=86400000L;
        long occurrence=leadAlertDueNow(c,24,"alarm"); // rings now, 30 min before its 20-min-away occurrence
        CompanionAlerts.finish(c,24,true,"Alarm snoozed");
        CompanionAlerts.restore(c); // a restore while snoozed keeps the snooze
        assertEquals("snoozed",CompanionAlerts.ledger(c).getJSONObject("24").getString("status"));
        CompanionAlerts.finish(c,24,false,"Alarm dismissed");
        assertEquals("dismissing the snoozed alarm ends today's occurrence",occurrence+day,CompanionAlerts.ledger(c).getJSONObject("24").getLong("at"));
        assertTrue(shadowOf(alarms).getNextScheduledAlarm().triggerAtTime>System.currentTimeMillis()+23*3600000L);
        occurrence=leadAlertDueNow(c,25,"alarm");
        CompanionAlerts.finish(c,25,true,"Alarm snoozed");
        JSONObject l=CompanionAlerts.ledger(c);long rang=System.currentTimeMillis()-120000;l.getJSONObject("25").put("status","ringing").put("at",rang).put("snoozeAt",rang).put("ringingSince",rang);CompanionAlerts.persist(c,l);
        CompanionAlerts.reconcile(c,CompanionStore.read(c),false); // the process died while the snoozed alarm rang
        assertEquals("an interrupted snoozed ring ends today's occurrence",occurrence+day,CompanionAlerts.ledger(c).getJSONObject("25").getLong("at"));
    }
    @Test public void undoingACompletionDoesNotPostASoundedLeadAlertAgain()throws Exception {
        Context c=RuntimeEnvironment.getApplication();AlarmManager alarms=c.getSystemService(AlarmManager.class);long day=86400000L;
        long occurrence=leadAlertDueNow(c,26,"reminder");
        CompanionAlerts.fired(c,26,occurrence); // the lead reminder posts
        JSONObject data=CompanionStore.read(c),e=CompanionAlerts.entry(data,26);
        e.put("completedOccurrences",new JSONArray().put(Instant.ofEpochMilli(occurrence).toString()));CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertEquals(occurrence+day,CompanionAlerts.ledger(c).getJSONObject("26").getLong("at"));
        e.remove("completedOccurrences");CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false); // Undo
        assertEquals("Undo does not post the sounded reminder again",occurrence+day,CompanionAlerts.ledger(c).getJSONObject("26").getLong("at"));
        assertTrue(shadowOf(alarms).getNextScheduledAlarm().triggerAtTime>System.currentTimeMillis()+3600000);
        // A completion ticked before the lead alert sounded, then undone, still arms today's alert.
        occurrence=leadAlertDueNow(c,27,"reminder");data=CompanionStore.read(c);e=CompanionAlerts.entry(data,27);
        e.put("completedOccurrences",new JSONArray().put(Instant.ofEpochMilli(occurrence).toString()));CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        e.remove("completedOccurrences");CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertEquals("an alert that never sounded is armed again by Undo",occurrence,CompanionAlerts.ledger(c).getJSONObject("27").getLong("at"));
        // A one-time task done after its reminder posted, then undone, does not post it again.
        long once=(System.currentTimeMillis()/60000+20)*60000;
        JSONObject t=new JSONObject().put("id",28).put("title","Call").put("raw","Call").put("revisions",new JSONArray()).put("planned",Instant.ofEpochMilli(once).toString()).put("alertIntent",new JSONObject().put("type","reminder").put("lead",30));
        data.getJSONArray("entries").put(t);CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);CompanionAlerts.fired(c,28,once);
        t.put("done",true);CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        t.put("done",false);CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertNotEquals("Undo of done does not arm the posted one-time reminder","scheduled",CompanionAlerts.ledger(c).getJSONObject("28").getString("status"));
        // Moving the task to a later time today still arms it.
        t.put("planned",Instant.ofEpochMilli(once+3600000).toString());CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertEquals(once+3600000,CompanionAlerts.ledger(c).getJSONObject("28").getLong("at"));
    }
    /** A daily alarm whose ledger row says ringing at {@code since}, with no alarm service holding it. */
    private static JSONObject ringingRow(Context c,long id,long occurrence,long since)throws Exception{
        CompanionAlerts.channels(c);
        JSONObject e=new JSONObject().put("id",id).put("title","Wake").put("raw","Wake").put("revisions",new JSONArray()).put("planned",Instant.ofEpochMilli(occurrence).toString()).put("recurrence","daily").put("alertIntent",new JSONObject().put("type","alarm"));
        JSONObject data=new JSONObject().put("schema",2).put("version",1).put("entries",new JSONArray().put(e)).put("memories",new JSONArray()).put("history",new JSONArray()).put("conversations",new JSONArray().put(new JSONObject()));
        CompanionStore.writeRaw(c,data);
        CompanionAlerts.persist(c,new JSONObject().put(String.valueOf(id),new JSONObject().put("fingerprint",CompanionAlerts.fingerprint(e)).put("type","alarm").put("status","ringing").put("label","Alarm ringing").put("at",occurrence).put("ringingSince",since)));
        return data;
    }
    @Test public void aRingingRowLeftByADeadServiceIsReArmedOnResume()throws Exception {
        Context c=RuntimeEnvironment.getApplication();AlarmManager alarms=c.getSystemService(AlarmManager.class);
        long occurrence=(System.currentTimeMillis()/60000-2)*60000,day=86400000L;
        JSONObject data=ringingRow(c,31,occurrence,occurrence);
        assertTrue(CompanionAlarmService.activeIds().isEmpty());
        CompanionAlerts.reconcile(c,data,false); // the app resumes after the process died while the alarm rang
        JSONObject row=CompanionAlerts.ledger(c).getJSONObject("31");
        assertEquals("scheduled",row.getString("status"));
        assertEquals("tomorrow's occurrence, not today's again",occurrence+day,row.getLong("at"));
        assertEquals("tomorrow's alarm is armed",1,shadowOf(alarms).getScheduledAlarms().size());
    }
    @Test public void anAlarmStillStartingItsServiceIsNotDisarmedByAResume()throws Exception {
        Context c=RuntimeEnvironment.getApplication();AlarmManager alarms=c.getSystemService(AlarmManager.class);
        long now=System.currentTimeMillis(),occurrence=now-1000;
        JSONObject data=ringingRow(c,32,occurrence,now-1000); // fired() saved ringing; onStartCommand has not run yet
        CompanionAlerts.reconcile(c,data,false);
        JSONObject row=CompanionAlerts.ledger(c).getJSONObject("32");
        assertEquals("ringing",row.getString("status"));
        assertEquals(occurrence,row.getLong("at"));
        assertEquals(0,shadowOf(alarms).getScheduledAlarms().size());
    }
}

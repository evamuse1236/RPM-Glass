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
    @Test public void aRestoreOrCheckAlertsKeepsARepeatingTasksPostedReminderInTheShade()throws Exception {
        Context c=RuntimeEnvironment.getApplication();NotificationManager nm=c.getSystemService(NotificationManager.class);long day=86400000L;
        long occurrence=leadAlertDueNow(c,43,"reminder");
        CompanionAlerts.fired(c,43,occurrence);
        assertNotNull("the reminder posted",shadowOf(nm).getNotification("companion-reminder",43));
        CompanionAlerts.restore(c); // app update, clock or zone change, exact-alarm grant
        assertNotNull("a restore must not take a posted reminder out of the shade",shadowOf(nm).getNotification("companion-reminder",43));
        assertEquals(occurrence+day,CompanionAlerts.ledger(c).getJSONObject("43").getLong("at"));
        CompanionAlerts.check(c); // Settings Check alerts
        assertNotNull("Check alerts must not take a posted reminder out of the shade",shadowOf(nm).getNotification("companion-reminder",43));
        assertEquals(occurrence+day,CompanionAlerts.ledger(c).getJSONObject("43").getLong("at"));
        JSONObject data=CompanionStore.read(c);CompanionAlerts.entry(data,43).put("done",true);CompanionStore.writeRaw(c,data);
        CompanionAlerts.reconcile(c,data,false);
        assertNull("a changed task still clears its posted reminder",shadowOf(nm).getNotification("companion-reminder",43));
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
    @Test public void doneThenUndoOrAlertOffThenOnWhileALeadAlarmRingsDoesNotRingItAgain()throws Exception {
        Context c=RuntimeEnvironment.getApplication();AlarmManager alarms=c.getSystemService(AlarmManager.class);long day=86400000L;
        // A one-time task 20 min away rings its 30-min lead alarm; Done stops the ring, then Undo.
        long once=(System.currentTimeMillis()/60000+20)*60000;CompanionAlerts.channels(c);
        JSONObject t=new JSONObject().put("id",60).put("title","Call").put("raw","Call").put("revisions",new JSONArray()).put("planned",Instant.ofEpochMilli(once).toString()).put("alertIntent",new JSONObject().put("type","alarm").put("lead",30));
        JSONObject data=new JSONObject().put("schema",2).put("version",1).put("entries",new JSONArray().put(t)).put("memories",new JSONArray()).put("history",new JSONArray()).put("conversations",new JSONArray().put(new JSONObject()));
        CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);CompanionAlerts.fired(c,60,once);
        assertEquals("ringing",CompanionAlerts.ledger(c).getJSONObject("60").getString("status"));
        t.put("done",true);CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        t.put("done",false);CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertNotEquals("Undo of done does not ring the one-time alarm that already rang","scheduled",CompanionAlerts.ledger(c).getJSONObject("60").getString("status"));
        // A repeating task: today's occurrence ticked while its alarm rings, then Undo.
        long occurrence=leadAlertDueNow(c,61,"alarm");CompanionAlerts.fired(c,61,occurrence);
        data=CompanionStore.read(c);JSONObject e=CompanionAlerts.entry(data,61);
        e.put("completedOccurrences",new JSONArray().put(Instant.ofEpochMilli(occurrence).toString()));CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        e.remove("completedOccurrences");CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertEquals("Undo does not ring today's alarm again",occurrence+day,CompanionAlerts.ledger(c).getJSONObject("61").getLong("at"));
        assertTrue(shadowOf(alarms).getNextScheduledAlarm().triggerAtTime>System.currentTimeMillis()+3600000);
        // The alert turned off while it rings, then on again.
        occurrence=leadAlertDueNow(c,62,"alarm");CompanionAlerts.fired(c,62,occurrence);
        data=CompanionStore.read(c);e=CompanionAlerts.entry(data,62);
        e.getJSONObject("alertIntent").put("type","none");CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        e.getJSONObject("alertIntent").put("type","alarm");CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertEquals("turning the alert back on does not ring today's alarm again",occurrence+day,CompanionAlerts.ledger(c).getJSONObject("62").getLong("at"));
    }
    @Test public void undoingAMoveDoesNotPostASoundedLeadReminderAgain()throws Exception {
        Context c=RuntimeEnvironment.getApplication();long day=86400000L;
        // A one-time task 20 min away posts its 30-min lead reminder, is moved to tomorrow, then the move is undone.
        long once=(System.currentTimeMillis()/60000+20)*60000;CompanionAlerts.channels(c);
        JSONObject t=new JSONObject().put("id",41).put("title","Call").put("raw","Call").put("revisions",new JSONArray()).put("planned",Instant.ofEpochMilli(once).toString()).put("alertIntent",new JSONObject().put("type","reminder").put("lead",30));
        JSONObject data=new JSONObject().put("schema",2).put("version",1).put("entries",new JSONArray().put(t)).put("memories",new JSONArray()).put("history",new JSONArray()).put("conversations",new JSONArray().put(new JSONObject()));
        CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);CompanionAlerts.fired(c,41,once);
        t.put("planned",Instant.ofEpochMilli(once+day).toString());CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertEquals("the move arms tomorrow",once+day,CompanionAlerts.ledger(c).getJSONObject("41").getLong("at"));
        t.put("planned",Instant.ofEpochMilli(once).toString());CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false); // Undo
        assertNotEquals("Undo of a move does not arm the posted one-time reminder","scheduled",CompanionAlerts.ledger(c).getJSONObject("41").getString("status"));
        // Moving it to an earlier time that is still ahead arms that new time.
        t.put("planned",Instant.ofEpochMilli(once-5*60000).toString());CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertEquals("scheduled",CompanionAlerts.ledger(c).getJSONObject("41").getString("status"));
        assertEquals(once-5*60000,CompanionAlerts.ledger(c).getJSONObject("41").getLong("at"));
        // A daily task whose lead reminder posted, moved to tomorrow and undone, keeps tomorrow's occurrence.
        long occurrence=leadAlertDueNow(c,42,"reminder");CompanionAlerts.fired(c,42,occurrence);
        data=CompanionStore.read(c);JSONObject e=CompanionAlerts.entry(data,42);
        e.put("planned",Instant.ofEpochMilli(occurrence+day).toString());CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        e.put("planned",Instant.ofEpochMilli(occurrence).toString());CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false); // Undo
        assertEquals("Undo of a move does not arm today's posted reminder",occurrence+day,CompanionAlerts.ledger(c).getJSONObject("42").getLong("at"));
    }
    @Test public void undoingDoneOnASnoozedLeadAlarmKeepsTheSnoozeAndDoesNotRingAtOnce()throws Exception {
        Context c=RuntimeEnvironment.getApplication();AlarmManager alarms=c.getSystemService(AlarmManager.class);
        // A one-time alarm rings its 30-min lead, is snoozed, then the task is ticked done and Undo is tapped.
        long once=(System.currentTimeMillis()/60000+20)*60000;CompanionAlerts.channels(c);
        JSONObject t=new JSONObject().put("id",35).put("title","Call").put("raw","Call").put("revisions",new JSONArray()).put("planned",Instant.ofEpochMilli(once).toString()).put("alertIntent",new JSONObject().put("type","alarm").put("lead",30));
        JSONObject data=new JSONObject().put("schema",2).put("version",1).put("entries",new JSONArray().put(t)).put("memories",new JSONArray()).put("history",new JSONArray()).put("conversations",new JSONArray().put(new JSONObject()));
        CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        JSONObject l=CompanionAlerts.ledger(c);l.getJSONObject("35").put("status","ringing").put("ringingSince",System.currentTimeMillis());CompanionAlerts.persist(c,l);
        CompanionAlerts.finish(c,35,true,"Alarm snoozed");
        long snoozeAt=CompanionAlerts.ledger(c).getJSONObject("35").getLong("at");
        t.put("done",true);CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertEquals("done silences the snoozed alarm",0,shadowOf(alarms).getScheduledAlarms().size());
        t.put("done",false);CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false); // Undo
        JSONObject row=CompanionAlerts.ledger(c).getJSONObject("35");
        assertTrue("Undo does not ring the snoozed, already-rung alarm at once",shadowOf(alarms).getNextScheduledAlarm().triggerAtTime>System.currentTimeMillis()+5*60000);
        assertEquals("Undo keeps the snooze","snoozed",row.getString("status"));
        assertEquals(snoozeAt,row.getLong("at"));
        assertEquals(once,CompanionAlerts.occurrence(row));
        CompanionAlerts.restore(c); // a reboot while snoozed keeps the snooze
        assertEquals("snoozed",CompanionAlerts.ledger(c).getJSONObject("35").getString("status"));
        assertEquals(snoozeAt,CompanionAlerts.ledger(c).getJSONObject("35").getLong("at"));
        CompanionAlerts.cancel(c,35);
        // A daily alarm snoozed, then today's occurrence ticked and undone, takes the same path.
        long occurrence=leadAlertDueNow(c,36,"alarm");
        l=CompanionAlerts.ledger(c);l.getJSONObject("36").put("status","ringing").put("ringingSince",System.currentTimeMillis());CompanionAlerts.persist(c,l);
        CompanionAlerts.finish(c,36,true,"Alarm snoozed");
        snoozeAt=CompanionAlerts.ledger(c).getJSONObject("36").getLong("at");
        data=CompanionStore.read(c);JSONObject e=CompanionAlerts.entry(data,36);
        e.put("completedOccurrences",new JSONArray().put(Instant.ofEpochMilli(occurrence).toString()));CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertEquals("ticking today's occurrence arms tomorrow",occurrence+86400000L,CompanionAlerts.ledger(c).getJSONObject("36").getLong("at"));
        e.remove("completedOccurrences");CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false); // Undo
        row=CompanionAlerts.ledger(c).getJSONObject("36");
        assertTrue("Undo does not ring today's already-rung alarm at once",shadowOf(alarms).getNextScheduledAlarm().triggerAtTime>System.currentTimeMillis()+5*60000);
        assertEquals("snoozed",row.getString("status"));
        assertEquals(snoozeAt,row.getLong("at"));
        assertEquals(occurrence,CompanionAlerts.occurrence(row));
    }
    @Test public void changingRepeatLeadOrTypeAfterTheAlertSoundedDoesNotSoundItAgain()throws Exception {
        Context c=RuntimeEnvironment.getApplication();AlarmManager alarms=c.getSystemService(AlarmManager.class);long day=86400000L;
        long occurrence=leadAlertDueNow(c,33,"reminder");
        CompanionAlerts.fired(c,33,occurrence); // the lead reminder posts
        String[][] edits={{"recurrence","weekly"},{"lead","15"},{"type","none"},{"type","reminder"}};
        for(String[] edit:edits){
            JSONObject data=CompanionStore.read(c),e=CompanionAlerts.entry(data,33);
            if(edit[0].equals("recurrence"))e.put("recurrence",edit[1]);else if(edit[0].equals("lead"))e.getJSONObject("alertIntent").put("lead",Integer.parseInt(edit[1]));else if(edit[1].equals("none"))e.getJSONObject("alertIntent").put("type","none");else e.getJSONObject("alertIntent").put("type",edit[1]);
            CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
            JSONObject row=CompanionAlerts.ledger(c).getJSONObject("33");
            if(edit[1].equals("none")){assertEquals("off",row.getString("status"));continue;}
            assertTrue("changing "+edit[0]+" to "+edit[1]+" must not re-arm the occurrence whose reminder posted",row.getLong("at")>occurrence);
            assertTrue(shadowOf(alarms).getNextScheduledAlarm().triggerAtTime>System.currentTimeMillis()+3600000);
        }
        assertEquals(occurrence+7*day,CompanionAlerts.ledger(c).getJSONObject("33").getLong("at"));
        // A one-time task whose reminder posted is not posted again when its lead changes.
        long once=(System.currentTimeMillis()/60000+20)*60000;JSONObject data=CompanionStore.read(c);
        JSONObject t=new JSONObject().put("id",34).put("title","Call").put("raw","Call").put("revisions",new JSONArray()).put("planned",Instant.ofEpochMilli(once).toString()).put("alertIntent",new JSONObject().put("type","reminder").put("lead",30));
        data.getJSONArray("entries").put(t);CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);CompanionAlerts.fired(c,34,once);
        t.getJSONObject("alertIntent").put("lead",15);CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertNotEquals("a lead change does not arm the posted one-time reminder again","scheduled",CompanionAlerts.ledger(c).getJSONObject("34").getString("status"));
        // Moving it to a later time still arms it.
        t.put("planned",Instant.ofEpochMilli(once+3600000).toString());CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
        assertEquals(once+3600000,CompanionAlerts.ledger(c).getJSONObject("34").getLong("at"));
    }
    @Test public void doneOnASnoozedLeadAlertTicksTodaysOccurrence()throws Exception {
        Context c=RuntimeEnvironment.getApplication();
        long occurrence=leadAlertDueNow(c,29,"alarm"); // rings now, 30 min before its occurrence
        JSONObject l=CompanionAlerts.ledger(c);l.getJSONObject("29").put("status","ringing");CompanionAlerts.persist(c,l);
        CompanionAlerts.finish(c,29,true,"Alarm snoozed"); // rings again in 10 min, still before the occurrence
        assertEquals("the notch's Done on the snoozed alarm ticks today's occurrence",occurrence,NotchAlerting.doneStart(CompanionAlerts.ledger(c).getJSONObject("29"),0));
        occurrence=leadAlertDueNow(c,30,"reminder");
        CompanionAlerts.fired(c,30,occurrence); // the lead reminder posts
        CompanionAlerts.finish(c,30,true,"Reminder snoozed"); // the notch's Snooze
        long snoozeAt=CompanionAlerts.ledger(c).getJSONObject("30").getLong("at");
        CompanionAlerts.fired(c,30,snoozeAt);
        java.util.List<android.content.Intent> sent=shadowOf((Application)c).getBroadcastIntents();
        android.content.Intent last=sent.get(sent.size()-1);
        assertEquals(NotchAlerting.REMINDER_FIRED,last.getAction());
        assertEquals("the snoozed reminder's island shows its snooze time",snoozeAt,last.getLongExtra("at",0));
        assertEquals("the notch's Done on the snoozed reminder ticks today's occurrence",occurrence,last.getLongExtra("done",last.getLongExtra("at",0)));
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
    @Test public void aForcedRecheckAfterARepeatingTaskAlertedWaitsForTheNextOccurrence()throws Exception {
        Context c=RuntimeEnvironment.getApplication();long id=42,occ=System.currentTimeMillis()+1800000;
        CompanionAlerts.channels(c);AlarmManager alarms=c.getSystemService(AlarmManager.class);
        JSONObject e=new JSONObject().put("id",id).put("title","Daily walk").put("raw","Walk").put("revisions",new JSONArray()).put("planned",Instant.ofEpochMilli(occ).toString()).put("recurrence","daily").put("alertIntent",new JSONObject().put("type","reminder").put("lead",60));
        JSONObject row=new JSONObject();CompanionAlerts.schedule(c,e,row,occ);row.put("fingerprint",CompanionAlerts.fingerprint(e));
        JSONObject data=new JSONObject().put("schema",2).put("version",1).put("entries",new JSONArray().put(e)).put("memories",new JSONArray()).put("history",new JSONArray()).put("conversations",new JSONArray().put(new JSONObject()));
        CompanionStore.writeRaw(c,data);CompanionAlerts.persist(c,new JSONObject().put(String.valueOf(id),row));
        CompanionAlerts.fired(c,id,occ);
        assertEquals(occ+86400000L,CompanionAlerts.ledger(c).getJSONObject(String.valueOf(id)).getLong("at"));
        // Settings "Check alerts", an app update or a time zone change re-checks every alert.
        CompanionAlerts.reconcile(c,data,true);
        assertEquals("the occurrence that already alerted is not alerted again",occ+86400000L,CompanionAlerts.ledger(c).getJSONObject(String.valueOf(id)).getLong("at"));
        for(org.robolectric.shadows.ShadowAlarmManager.ScheduledAlarm a:shadowOf(alarms).getScheduledAlarms())assertTrue(a.triggerAtTime>System.currentTimeMillis()+60000);
        CompanionAlerts.cancel(c,id);
    }

    /** A time zone change re-checks every alert; today's occurrence in the new zone is armed even when it falls before the time armed in the old zone. */
    @Test public void aZoneChangeStillArmsTodaysEarlierOccurrence()throws Exception {
        java.util.TimeZone saved=java.util.TimeZone.getDefault();
        try{
            Context c=RuntimeEnvironment.getApplication();long id=43,x=(System.currentTimeMillis()/60000+30)*60000;CompanionAlerts.channels(c);
            // Planned in July at X's UTC time of day: 1 hour later than X in a London winter, the same instant as X in Kolkata.
            java.time.LocalTime utc=Instant.ofEpochMilli(x).atZone(java.time.ZoneOffset.UTC).toLocalTime();
            JSONObject e=new JSONObject().put("id",id).put("title","Daily alarm").put("raw","Alarm").put("revisions",new JSONArray()).put("planned",java.time.LocalDate.of(2026,7,1).atTime(utc).toInstant(java.time.ZoneOffset.UTC).toString()).put("recurrence","daily").put("alertIntent",new JSONObject().put("type","alarm"));
            JSONObject data=new JSONObject().put("schema",2).put("version",1).put("entries",new JSONArray().put(e)).put("memories",new JSONArray()).put("history",new JSONArray()).put("conversations",new JSONArray().put(new JSONObject()));
            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Europe/London"));
            CompanionStore.writeRaw(c,data);CompanionAlerts.reconcile(c,data,false);
            assertEquals("armed at 1 hour after X in a London winter",x+3600000L,CompanionAlerts.ledger(c).getJSONObject(String.valueOf(id)).getLong("at"));
            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Kolkata"));
            CompanionAlerts.restore(c);
            assertEquals("today's occurrence in Kolkata, still 30 min away, is armed",x,CompanionAlerts.ledger(c).getJSONObject(String.valueOf(id)).getLong("at"));
            CompanionAlerts.cancel(c,id);
        }finally{java.util.TimeZone.setDefault(saved);}
    }
    /** A ledger from the build before "sounded" was recorded holds a repeating row at tomorrow once today's lead alert posted; an update's restore keeps it there. */
    @Test public void aRestoreKeepsALegacyRowAtTomorrowWithNoSoundedField()throws Exception {
        Context c=RuntimeEnvironment.getApplication();long id=44,day=86400000L,occ=(System.currentTimeMillis()/60000+30)*60000;CompanionAlerts.channels(c);
        JSONObject e=new JSONObject().put("id",id).put("title","Daily walk").put("raw","Walk").put("revisions",new JSONArray()).put("planned",Instant.ofEpochMilli(occ).toString()).put("recurrence","daily").put("alertIntent",new JSONObject().put("type","reminder").put("lead",60));
        JSONObject data=new JSONObject().put("schema",2).put("version",1).put("entries",new JSONArray().put(e)).put("memories",new JSONArray()).put("history",new JSONArray()).put("conversations",new JSONArray().put(new JSONObject()));
        JSONObject row=new JSONObject();CompanionAlerts.schedule(c,e,row,occ+day);row.put("fingerprint",CompanionAlerts.fingerprint(e));
        assertFalse(row.has("sounded"));assertEquals("scheduled",row.getString("status"));
        CompanionStore.writeRaw(c,data);CompanionAlerts.persist(c,new JSONObject().put(String.valueOf(id),row));
        CompanionAlerts.restore(c);
        assertEquals("today's lead reminder, already posted, is not posted again",occ+day,CompanionAlerts.ledger(c).getJSONObject(String.valueOf(id)).getLong("at"));
        CompanionAlerts.cancel(c,id);
    }

    private static String source(String name)throws Exception{return new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/java/com/rpm/prototype/"+name+".java")),java.nio.charset.StandardCharsets.UTF_8);}
    /** Settings Check alerts reads and reconciles in one hold of the store lock, so a save between them cannot be undone by older data. */
    @Test public void checkAlertsReadsAndReconcilesUnderOneLock()throws Exception {
        String settings=source("CompanionSettingsController");int at=settings.indexOf("case \"check_alerts\":");assertTrue(at>=0);
        String body=settings.substring(at,settings.indexOf("break;",at));
        assertFalse("check_alerts must not read the store and reconcile in two lock holds: "+body,body.contains("CompanionStore.read("));
        assertTrue("check_alerts goes through CompanionAlerts.check: "+body,body.contains("CompanionAlerts.check(activity)"));
        String alerts=source("CompanionAlerts");int h=alerts.indexOf("static void check(Context c)throws Exception{");assertTrue("CompanionAlerts.check(Context) throws so the page shows errors",h>=0);
        String check=alerts.substring(h,alerts.indexOf('\n',h));
        int lock=check.indexOf("synchronized(CompanionStore.LOCK)"),read=check.indexOf("CompanionStore.read(c)"),rec=check.indexOf("reconcile(c,d,true)");
        assertTrue("check holds the lock across the read and the forced reconcile: "+check,lock>=0&&lock<read&&read<rec);
    }
}

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
}

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
}

package com.rpm.prototype;

import android.app.Application;
import android.content.Context;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import java.util.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=Application.class)
public class DiagnosticsRejectTest {
    private Context context;
    @Before public void setup(){context=RuntimeEnvironment.getApplication();Diagnostics.prefs(context).edit().clear().putString("token","test").commit();}
    private void queue(String id,long at)throws Exception{
        JSONObject event=Diagnostics.event("log","info","test","success",new JSONObject()).put("eventId",id).put("occurredAt",at);
        try(DiagnosticStore store=new DiagnosticStore(context)){store.add(event);}
    }
    private static JSONObject ack(JSONArray events)throws JSONException{JSONArray ack=new JSONArray();for(int i=0;i<events.length();i++)ack.put(events.getJSONObject(i).getString("eventId"));return new JSONObject().put("ack",ack);}
    private static boolean holds(JSONArray events,String id)throws JSONException{for(int i=0;i<events.length();i++)if(events.getJSONObject(i).getString("eventId").equals(id))return true;return false;}

    // The server rejects a whole batch (400) when one event's occurredAt is over 24h past its own clock.
    @Test public void anEventTheServerRejectsAloneIsDroppedAndTheRestStillUpload()throws Exception {
        long now=System.currentTimeMillis();
        queue("future-event-0000000",now+2*86400000L);queue("normal-event-0000000",now);
        List<String> delivered=new ArrayList<>();
        Diagnostics.Upload server=events->{if(holds(events,"future-event-0000000"))throw new SyncManager.Rejected();for(int i=0;i<events.length();i++)delivered.add(events.getJSONObject(i).getString("eventId"));return ack(events);};
        Diagnostics.sync(context,server);
        assertEquals(List.of("normal-event-0000000"),delivered);
        try(DiagnosticStore store=new DiagnosticStore(context)){assertEquals(0,store.count());assertEquals(1,store.dropped());}
        assertTrue(Diagnostics.prefs(context).getLong("next_attempt",0)>now);
    }
    @Test public void aBatchThatFailsOfflineWhileIsolatingKeepsEveryEvent()throws Exception {
        long now=System.currentTimeMillis();
        queue("future-event-0000000",now+2*86400000L);queue("normal-event-0000000",now);
        Diagnostics.Upload server=events->{if(events.length()>1)throw new SyncManager.Rejected();throw new java.io.IOException("offline");};
        Diagnostics.sync(context,server);
        try(DiagnosticStore store=new DiagnosticStore(context)){assertEquals(2,store.count());assertEquals(0,store.dropped());}
        assertTrue(Diagnostics.prefs(context).getLong("next_attempt",0)>now);
    }
    // The Keystore key that sealed the token is gone (a restore or a cleared Keystore): the token reaches the cipher and cannot be opened.
    @Test public void aLostKeyAsksToPairDiagnosticsAgainAndStopsRetrying()throws Exception {
        Diagnostics.prefs(context).edit().putString("token","aaaa:bbbb").putString("url","https://example.convex.site").commit();
        queue("queued-event-0000000",System.currentTimeMillis());
        assertFalse(Diagnostics.sync(context));
        assertTrue(Diagnostics.prefs(context).getBoolean("auth_error",false));
        assertEquals("This phone lost its diagnostics key · pair diagnostics again",Diagnostics.prefs(context).getString("status",""));
        try(DiagnosticStore store=new DiagnosticStore(context)){assertEquals(1,store.count());}
    }
    @Test public void aLostKeyStillKeepsTheEventsRecordedOnThePhone()throws Exception {
        Diagnostics.prefs(context).edit().putString("token","aaaa:bbbb").commit();
        Diagnostics.recordNow(context,Diagnostics.event("crash","error","native.crash","error",new JSONObject().put("error","boom")));
        try(DiagnosticStore store=new DiagnosticStore(context)){assertEquals(1,store.count());}
    }
}

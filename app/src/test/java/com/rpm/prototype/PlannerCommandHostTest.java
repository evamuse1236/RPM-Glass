package com.rpm.prototype;

import android.app.Application;
import android.content.Context;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import java.io.IOException;
import java.util.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=Application.class)
public class PlannerCommandHostTest {
    private final Context context=RuntimeEnvironment.getApplication();
    @Test public void bridgeSavesWithSyncOriginAndPreservesTheUserEditTime()throws Exception {
        JSONObject data=new JSONObject("{schema:2,version:1,entries:[{id:1,title:'Local',raw:'Local',revisions:[]}],memories:[],history:[],conversations:[{}],syncSavedAt:'2026-10-01T00:00:00Z'}");
        CompanionStore.write(context,data,0,"sync");
        try(PlannerCommandHost host=new PlannerCommandHost(context,()->{},(action,body)->new JSONObject())){
            JSONObject loaded=((JSONObject)host.dispatch("load",new JSONObject())).getJSONObject("data");
            loaded.put("version",2);loaded.getJSONArray("entries").getJSONObject(0).put("title","Remote");
            host.dispatch("save",new JSONObject().put("expected",1).put("data",loaded).put("origin","local"));
            JSONObject saved=CompanionStore.read(context);
            assertEquals("Remote",saved.getJSONArray("entries").getJSONObject(0).getString("title"));
            assertEquals("2026-10-01T00:00:00Z",saved.getString("syncSavedAt"));assertFalse(saved.has("sync"));
            assertThrows(IOException.class,()->host.dispatch("save",new JSONObject().put("expected",1).put("data",loaded)));
        }
    }
    @Test public void bridgeTransportsJsonAndRefusesLegacyActionsOrAChangedConnection()throws Exception {
        List<String> actions=new ArrayList<>();boolean[] connected={true};JSONObject body=new JSONObject().put("after",9);
        try(PlannerCommandHost host=new PlannerCommandHost(context,()->{if(!connected[0])throw new IOException("Disconnected");},(action,payload)->{actions.add(action);assertSame(body,payload);return new JSONObject().put("cursor",10);})){ 
            assertEquals(10,((JSONObject)host.dispatch("pull",body)).getInt("cursor"));host.dispatch("push",body);
            assertThrows(IllegalArgumentException.class,()->host.dispatch("input",body));
            connected[0]=false;assertThrows(IOException.class,()->host.dispatch("pull",body));assertEquals(List.of("pull","push"),actions);
        }
    }
}

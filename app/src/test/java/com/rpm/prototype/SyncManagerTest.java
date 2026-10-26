package com.rpm.prototype;

import org.junit.Test;
import org.json.*;
import okhttp3.mockwebserver.*;
import java.io.IOException;
import java.util.*;
import static org.junit.Assert.*;

public class SyncManagerTest {
    @Test public void runsOneReplicaWithGuardsBeforeAndAfter()throws Exception {
        List<String> calls=new ArrayList<>();
        PlannerSyncProtocol.sync(()->{calls.add("replica");return new JSONObject().put("cursor",7);},()->calls.add("guard"));
        assertEquals(List.of("guard","replica","guard"),calls);
    }
    @Test public void aChangedConnectionStopsTheReplica() {
        int[] runs={0};
        assertThrows(IOException.class,()->PlannerSyncProtocol.sync(()->{runs[0]++;return new JSONObject();},()->{throw new IOException("Disconnected");}));
        assertEquals(0,runs[0]);
    }
    @Test public void disconnectDuringTheReplicaAndRunnerFailuresAreNotSuccess() {
        int[] guards={0};
        assertThrows(IOException.class,()->PlannerSyncProtocol.sync(()->new JSONObject(),()->{if(++guards[0]==2)throw new IOException("Disconnected");}));
        assertThrows(IOException.class,()->PlannerSyncProtocol.sync(()->{throw new IOException("Retry me");},()->{}));
    }
    @Test public void transportPostsOnlyPushAndPullWithTheCapturedToken()throws Exception {
        try(MockWebServer server=new MockWebServer()){
            server.start();
            for(String action:List.of("push","pull")){
                server.enqueue(new MockResponse().setBody("{\"cursor\":9}"));int[] guards={0};
                JSONObject body=new JSONObject().put("seq",3);
                JSONObject result=PlannerSyncProtocol.exchange(server.url("/").toString().replaceAll("/+$",""),"device-token",action,body,()->guards[0]++);
                RecordedRequest request=server.takeRequest();assertEquals("/v1/planner/"+action,request.getPath());
                assertEquals("POST",request.getMethod());assertEquals("Bearer device-token",request.getHeader("Authorization"));
                assertEquals(body.toString(),request.getBody().readUtf8());assertEquals(9,result.getInt("cursor"));assertEquals(2,guards[0]);
            }
            assertThrows(IllegalArgumentException.class,()->PlannerSyncProtocol.exchange(server.url("/").toString(),"token","sync",new JSONObject(),()->{}));
            assertThrows(IOException.class,()->PlannerSyncProtocol.exchange(server.url("/").toString(),"token","push",new JSONObject().put("text","é".repeat(600000)),()->{}));
            assertEquals(2,server.getRequestCount());
        }
    }
    @Test public void transportRejectsRevocationAndChecksConnectionAfterNetwork()throws Exception {
        try(MockWebServer server=new MockWebServer()){
            server.start();String url=server.url("/").toString();
            server.enqueue(new MockResponse().setResponseCode(401));
            assertThrows(SyncManager.Unauthorized.class,()->PlannerSyncProtocol.exchange(url,"token","pull",new JSONObject(),()->{}));
            server.enqueue(new MockResponse().setResponseCode(413));
            assertThrows(SyncManager.Rejected.class,()->PlannerSyncProtocol.exchange(url,"token","push",new JSONObject(),()->{}));
            server.enqueue(new MockResponse().setBody("{}"));int[] guards={0};
            assertThrows(IOException.class,()->PlannerSyncProtocol.exchange(url,"token","pull",new JSONObject(),()->{if(++guards[0]==2)throw new IOException("Disconnected");}));
            assertThrows(IOException.class,()->PlannerSyncProtocol.exchange(url,"token","pull",new JSONObject(),()->{throw new IOException("Disconnected");}));
            assertEquals(3,server.getRequestCount());
        }
    }
    @Test public void aLoginTheKeystoreCanNoLongerUnlockAsksToPairAgain() {
        assertThrows(SyncManager.LostKey.class,()->SyncManager.unlock("iv:data",s->{throw new javax.crypto.AEADBadTagException();}));
        assertThrows(SyncManager.LostKey.class,()->SyncManager.unlock("iv:data",s->{throw new java.security.UnrecoverableKeyException();}));
        assertThrows(IOException.class,()->SyncManager.unlock("broken",s->{throw new IOException("Connection needs pairing");}));
    }
    @Test public void credentialsAreCapturedAsOneConnection() {
        Map<String,Object> saved=new HashMap<>();saved.put("url","https://first.convex.site");saved.put("token","fixture-first-token");
        SyncManager.Connection connection=new SyncManager.Connection(saved);
        saved.put("url","https://second.convex.site");saved.put("token","fixture-second-token");
        assertEquals("https://first.convex.site",connection.url);assertEquals("fixture-first-token",connection.encrypted);
    }
    @Test public void timingUsesOneSecondTwentySecondsAndTheAndroidMinimum() {
        assertEquals(1000,PlannerSyncProtocol.DEBOUNCE_MS);assertEquals(20000,PlannerSyncProtocol.FOREGROUND_MS);assertEquals(900000,PlannerSyncProtocol.BACKGROUND_MS);
    }
    @Test public void legacyAckStillRequiresTheExactIds()throws Exception {
        JSONArray sent=new JSONArray().put(new JSONObject().put("eventId","a")).put(new JSONObject().put("eventId","b"));
        SyncManager.validateAck(sent,new JSONArray().put("b").put("a"));
        assertThrows(JSONException.class,()->SyncManager.validateAck(sent,new JSONArray().put("a").put("a")));
    }
}

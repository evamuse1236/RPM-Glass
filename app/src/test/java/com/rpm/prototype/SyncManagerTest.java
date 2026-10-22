package com.rpm.prototype;

import org.junit.Test;
import org.json.*;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import static org.junit.Assert.*;

public class SyncManagerTest {
    private static final String ID="12345678-1234-4123-8123-123456789abc";
    private JSONObject snapshot()throws Exception {
        Path file=Paths.get("../web/fixtures/snapshot.json");if(!Files.exists(file))file=Paths.get("web/fixtures/snapshot.json");
        return new JSONObject(new String(Files.readAllBytes(file),java.nio.charset.StandardCharsets.UTF_8));
    }
    private JSONObject command()throws Exception{return new JSONObject().put("id",ID).put("type","complete").put("baseRevision",42).put("createdAt","2026-10-19T00:00:00Z").put("args",new JSONObject().put("taskId",1));}
    private JSONObject result(JSONObject snapshot,JSONArray acks)throws Exception{return new JSONObject().put("snapshot",snapshot).put("acks",acks);}
    private JSONObject ack(long revision)throws Exception{return new JSONObject().put("id",ID).put("status","applied").put("message","Task completed").put("newRevision",revision);}
    private JSONObject pull(JSONArray commands)throws Exception{return new JSONObject().put("commands",commands).put("snapshots",new JSONArray().put(snapshot())).put("revokedCommandIds",new JSONArray());}

    @Test public void pullsAndAcknowledgesWithTheNewSnapshotEvenWithoutLegacyOutbox()throws Exception {
        List<JSONObject> uploads=new ArrayList<>();List<Integer> runs=new ArrayList<>();JSONObject before=snapshot(),after=snapshot().put("revision",43);
        PlannerSyncProtocol.sync(payload->{uploads.add(payload);return pull(uploads.size()==1?new JSONArray().put(command()):new JSONArray());},(commands,snapshots,revoked)->{
            runs.add(commands.length());if(commands.length()==0)return result(before,new JSONArray());
            assertEquals(42,snapshots.getJSONObject(0).getInt("revision"));return result(after,new JSONArray().put(ack(43)));
        },()->{});
        assertEquals(List.of(0,1),runs);assertEquals(2,uploads.size());assertEquals(42,uploads.get(0).getJSONObject("snapshot").getInt("revision"));assertEquals(43,uploads.get(1).getJSONObject("snapshot").getInt("revision"));assertEquals(ID,uploads.get(1).getJSONArray("acks").getJSONObject(0).getString("id"));
    }
    @Test public void lostAckRedeliversTheSameIdAndDurableResult()throws Exception {
        Map<String,JSONObject> receipts=new HashMap<>();int[] effects={0},requests={0};boolean[] fail={true};
        PlannerSyncProtocol.Runner phone=(commands,snapshots,revoked)->{
            JSONArray acks=new JSONArray();for(int i=0;i<commands.length();i++){
                String id=commands.getJSONObject(i).getString("id");if(!receipts.containsKey(id)){effects[0]++;receipts.put(id,ack(43));}acks.put(receipts.get(id));
            }return result(snapshot().put("revision",effects[0]==0?42:43),acks);
        };
        PlannerSyncProtocol.Transport transport=payload->{requests[0]++;if(payload.getJSONArray("acks").length()>0&&fail[0]){fail[0]=false;throw new IOException("Lost response");}return pull(payload.getJSONArray("acks").length()==0?new JSONArray().put(command()):new JSONArray());};
        assertThrows(IOException.class,()->PlannerSyncProtocol.sync(transport,phone,()->{}));PlannerSyncProtocol.sync(transport,phone,()->{});
        assertEquals(1,effects[0]);assertEquals(4,requests[0]);assertEquals(43,receipts.get(ID).getInt("newRevision"));
    }
    @Test public void aChangedConnectionStopsCommandExecution()throws Exception {
        int[] guards={0},runs={0};
        assertThrows(IOException.class,()->PlannerSyncProtocol.sync(payload->pull(new JSONArray().put(command())),(commands,snapshots,revoked)->{runs[0]++;return result(snapshot(),new JSONArray());},()->{if(++guards[0]>=3)throw new IOException("Disconnected");}));
        assertEquals(1,runs[0]);
    }
    @Test public void invalidResultsAreNeverAcknowledged()throws Exception {
        JSONArray commands=new JSONArray().put(command());
        assertThrows(JSONException.class,()->PlannerSyncProtocol.validateResults(commands,new JSONArray()));
        assertThrows(JSONException.class,()->PlannerSyncProtocol.validateResults(commands,new JSONArray().put(ack(43).put("status","pending"))));
        assertThrows(JSONException.class,()->PlannerSyncProtocol.validateResults(commands,new JSONArray().put(ack(43).put("id","another-command"))));
    }
    @Test public void anAppliedCommandIsAcknowledgedBeforeTheNextCommandCanFail()throws Exception {
        String second="87654321-4321-4123-8123-123456789abc";List<JSONObject> uploads=new ArrayList<>();
        assertThrows(IOException.class,()->PlannerSyncProtocol.sync(payload->{uploads.add(payload);return pull(uploads.size()==1?new JSONArray().put(command()).put(command().put("id",second)):new JSONArray().put(command().put("id",second)));},(commands,snapshots,revoked)->{
            if(commands.length()==0)return result(snapshot(),new JSONArray());
            assertEquals(1,commands.length());if(commands.getJSONObject(0).getString("id").equals(second))throw new IOException("Slow Capture interrupted");
            return result(snapshot().put("revision",43),new JSONArray().put(ack(43)));
        },()->{}));
        assertEquals(2,uploads.size());assertEquals(ID,uploads.get(1).getJSONArray("acks").getJSONObject(0).getString("id"));
    }
    @Test public void eachAckRefreshesRevocationBeforeStartingTheNextCommand()throws Exception {
        String second="87654321-4321-4123-8123-123456789abc";int[] uploads={0};List<Boolean> cancellation=new ArrayList<>();
        PlannerSyncProtocol.sync(payload->{
            uploads[0]++;if(uploads[0]==1)return pull(new JSONArray().put(command()).put(command().put("id",second)));
            if(uploads[0]==2)return pull(new JSONArray().put(command().put("id",second))).put("revokedCommandIds",new JSONArray().put(second));
            return pull(new JSONArray());
        },(commands,snapshots,revoked)->{
            if(commands.length()==0)return result(snapshot(),new JSONArray());
            String id=commands.getJSONObject(0).getString("id");boolean cancelled=revoked.length()>0;cancellation.add(cancelled);
            return result(snapshot().put("revision",cancelled?44:43),new JSONArray().put(ack(cancelled?44:43).put("id",id).put("status",cancelled?"rejected":"applied")));
        },()->{});
        assertEquals(List.of(false,true),cancellation);assertEquals(3,uploads[0]);
    }
    @Test public void aLoginTheKeystoreCanNoLongerUnlockAsksToPairAgain() {
        org.junit.Assert.assertThrows(SyncManager.LostKey.class,()->SyncManager.unlock("iv:data",s->{throw new javax.crypto.AEADBadTagException();}));
        org.junit.Assert.assertThrows(SyncManager.LostKey.class,()->SyncManager.unlock("iv:data",s->{throw new java.security.UnrecoverableKeyException();}));
        org.junit.Assert.assertThrows(java.io.IOException.class,()->SyncManager.unlock("broken",s->{throw new java.io.IOException("Connection needs pairing");}));
    }
    @Test public void credentialsAreCapturedAsOneConnection() {
        Map<String,Object> saved=new HashMap<>();saved.put("url","https://first.convex.site");saved.put("token","fixture-first-token");
        SyncManager.Connection connection=new SyncManager.Connection(saved);
        saved.put("url","https://second.convex.site");saved.put("token","fixture-second-token");
        assertEquals("https://first.convex.site",connection.url);assertEquals("fixture-first-token",connection.encrypted);
    }
    @Test public void snapshotBoundaryRejectsKeysTokensAndTracesAtAnyDepth()throws Exception {
        PlannerSyncProtocol.validateSnapshot(snapshot());
        for(String field:List.of("apiKey","openrouter_key","token","traces","password","Authorization")){
            JSONObject unsafe=snapshot();unsafe.getJSONArray("tasks").getJSONObject(0).put(field,"private");
            assertThrows(field,JSONException.class,()->PlannerSyncProtocol.validateSnapshot(unsafe));
        }
        assertThrows(JSONException.class,()->PlannerSyncProtocol.validateSnapshot(snapshot().put("phone",new JSONObject())));
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

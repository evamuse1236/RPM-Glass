package com.rpm.prototype;

import org.json.*;
import java.util.Set;

final class PlannerSyncProtocol {
    static final long FOREGROUND_MS=20000,DEBOUNCE_MS=1000,BACKGROUND_MS=15*60*1000;
    interface Transport {JSONObject exchange(JSONObject payload)throws Exception;}
    interface Runner {JSONObject run(JSONArray commands,JSONArray snapshots,JSONArray revokedIds)throws Exception;}
    interface Guard {void check()throws Exception;}

    static void sync(Transport transport,Runner runner,Guard guard)throws Exception {
        guard.check();
        JSONObject initial=runner.run(new JSONArray(),new JSONArray(),new JSONArray());
        JSONObject first=exchange(transport,initial,guard);
        JSONArray commands=first.getJSONArray("commands");
        if(commands.length()==0)return;
        JSONArray bases=first.getJSONArray("snapshots");JSONObject current=first;
        for(int i=0;i<20&&current.getJSONArray("commands").length()>0;i++){
            guard.check();JSONArray one=new JSONArray().put(current.getJSONArray("commands").getJSONObject(0));
            JSONObject applied=runner.run(one,bases,current.getJSONArray("revokedCommandIds"));
            validateResults(one,applied.getJSONArray("acks"));
            current=exchange(transport,applied,guard);
            JSONArray newer=current.getJSONArray("snapshots");Set<Long> revisions=new java.util.HashSet<>();
            for(int j=0;j<bases.length();j++)revisions.add(bases.getJSONObject(j).getLong("revision"));
            for(int j=0;j<newer.length();j++)if(revisions.add(newer.getJSONObject(j).getLong("revision")))bases.put(newer.getJSONObject(j));
        }
    }
    private static JSONObject exchange(Transport transport,JSONObject result,Guard guard)throws Exception {
        JSONObject payload=new JSONObject().put("acks",result.getJSONArray("acks"));
        if(!result.isNull("snapshot")&&result.has("snapshot")){
            JSONObject snapshot=result.getJSONObject("snapshot");validateSnapshot(snapshot);payload.put("snapshot",snapshot);
        }
        guard.check();return transport.exchange(payload);
    }
    static void validateResults(JSONArray commands,JSONArray acks)throws JSONException {
        if(commands.length()!=acks.length())throw new JSONException("Incomplete command results");
        Set<String> seen=new java.util.HashSet<>();
        for(int i=0;i<commands.length();i++)seen.add(commands.getJSONObject(i).getString("id"));
        for(int i=0;i<acks.length();i++){
            JSONObject ack=acks.getJSONObject(i);
            if(!seen.remove(ack.getString("id"))||!Set.of("applied","rejected","conflict").contains(ack.getString("status"))||ack.getLong("newRevision")<0||ack.getString("message").length()>1000)throw new JSONException("Invalid command result");
        }
        if(!seen.isEmpty())throw new JSONException("Incomplete command results");
    }
    static void validateSnapshot(JSONObject snapshot)throws JSONException {
        Set<String> fields=Set.of("schemaVersion","revision","savedAt","tasks","blocks","projects","areas","goals","drafts","captures","body");
        if(snapshot.length()!=fields.size()||snapshot.getInt("schemaVersion")!=1||snapshot.getLong("revision")<0)throw new JSONException("Invalid planner snapshot");
        for(String field:fields)if(!snapshot.has(field))throw new JSONException("Incomplete planner snapshot");
        checkPrivateFields(snapshot);
    }
    private static void checkPrivateFields(Object value)throws JSONException {
        if(value instanceof JSONObject){
            JSONObject object=(JSONObject)value;
            for(java.util.Iterator<String> keys=object.keys();keys.hasNext();){
                String key=keys.next();String normalized=key.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z]","");
                if(normalized.contains("token")||normalized.contains("trace")||normalized.contains("secret")||normalized.contains("key")||Set.of("authorization","password").contains(normalized))throw new JSONException("Private data cannot enter planner sync");
                checkPrivateFields(object.get(key));
            }
        }else if(value instanceof JSONArray){JSONArray array=(JSONArray)value;for(int i=0;i<array.length();i++)checkPrivateFields(array.get(i));}
    }
}

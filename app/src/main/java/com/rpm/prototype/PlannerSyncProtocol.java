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
        Set<String> fields=Set.of("schemaVersion","revision","savedAt","tasks","blocks","projects","areas","goals","drafts","captures","body","entries","planner");
        if(snapshot.length()!=fields.size()||snapshot.getInt("schemaVersion")!=2||snapshot.getLong("revision")<0)throw new JSONException("Invalid planner snapshot");
        for(String field:fields)if(!snapshot.has(field))throw new JSONException("Incomplete planner snapshot");
        checkSnapshotFields(snapshot, "");
    }
    // Field boundaries mirror snapshot.schema.json. JSON value/date validation also runs in JS and Convex.
    private static String allowedFields(String path)throws JSONException {
        switch(path){
            case "":
                return "schemaVersion,revision,savedAt,tasks,blocks,projects,areas,goals,drafts,captures,body,entries,planner";
            case "tasks[]":
                return "id,title,raw,notes,purpose,planned,plannedDate,minutes,alert,blockId,must,priority,done,archived,archiveDisposition,recurrence,repeatAfterDays,completedAt,completedOccurrences";
            case "blocks[]":
            case "projects[]":
            case "areas[]":
            case "goals[]":
                return "id,title,purpose,notes,archived,projectId,goalId,areaId,year,horizon,period,rating,colorIndex";
            case "drafts[]":
            case "planner.drafts[]":
                return "id,status,title,reply,receipt,taskIds";
            case "drafts[].receipt[]":
            case "captures[].receipt[]":
            case "planner.drafts[].receipt[]":
                return "text";
            case "captures[]":
                return "id,text,status,createdAt,receipt";
            case "body":
                return "water,meals,mealPlan,routines,runs";
            case "body.water":
            case "planner.body.water":
                return "settings,glasses,snoozedUntil";
            case "body.water.settings":
            case "planner.body.water.settings":
                return "goal,intervalMinutes,from,until,glassMl,snoozeMinutes,reminders";
            case "body.meals[]":
                return "id,name,slot,at";
            case "body.mealPlan":
            case "planner.body.mealPlan":
                return "slots";
            case "body.mealPlan.slots[]":
            case "planner.body.mealPlan.slots[]":
                return "slot,at,on,name";
            case "body.routines[]":
                return "id,name,start,end,days,steps,archived";
            case "body.routines[].steps[]":
            case "planner.body.routines[].steps[]":
                return "id,title";
            case "body.runs[]":
            case "planner.body.runs[]":
                return "routineId,day,marks,skippedDay";
            case "body.runs[].marks[]":
                return "stepId,state,at";
            case "entries[]":
                return "id,title,raw,notes,purpose,planned,plannedDate,minutes,blockId,must,priority,done,archived,archiveDisposition,recurrence,repeatAfterDays,completedAt,completedOccurrences,kind,state,created,source,durationSource,leverage,alertIntent,repeatDays,completions,reviewChoice,reviewActivityDays";
            case "entries[].alertIntent":
                return "type,lead";
            case "entries[].completions[]":
                return "occurrence,completed";
            case "entries[].reviewChoice":
                return "week,choice,at,cleared";
            case "entries[].reviewChoice.cleared":
                return "planned,plannedDate";
            case "planner":
                return "schema,reviewVersion,uxVersion,blocks,projects,areas,goals,context,weeks,reviews,body,drafts,events";
            case "planner.blocks[]":
            case "planner.projects[]":
            case "planner.areas[]":
            case "planner.goals[]":
                return "id,title,purpose,notes,archived,projectId,goalId,areaId,year,horizon,period,rating,colorIndex,created,achieved,achievedAt,evidence";
            case "planner.context":
                return "vision,goals,coreValues,approved,updated";
            case "planner.weeks.*":
                return "focus,verdicts";
            case "planner.reviews.*":
                return "step,finishedAt,focusDraft,inboxIds,keptIds,clashes,startedAt,updatedAt";
            case "planner.body":
                return "water,meals,mealPlan,routines,runs,schema,mealGuesses";
            case "planner.body.meals[]":
                return "id,name,slot,at,created,state";
            case "planner.body.routines[]":
                return "id,name,start,end,days,steps,archived,created,updated";
            case "planner.body.runs[].marks.*":
                return "state,at";
            case "planner.body.mealGuesses.*":
                return "status,by,at,kcal,protein";
            case "planner.events[]":
                return "";
            case "planner.weeks":
            case "planner.weeks.*.verdicts":
            case "planner.reviews":
            case "planner.reviews.*.clashes":
            case "planner.body.runs[].marks":
            case "planner.body.mealGuesses":
                return "*";
            default: throw new JSONException("Unknown planner snapshot record");
        }
    }
    private static void checkSnapshotFields(Object value,String path)throws JSONException {
        if(value instanceof JSONObject){
            JSONObject object=(JSONObject)value;
            String allowed=allowedFields(path);
            Set<String> fields=new java.util.HashSet<>(java.util.Arrays.asList(allowed.split(",")));
            for(java.util.Iterator<String> keys=object.keys();keys.hasNext();){
                String key=keys.next();
                if(!allowed.equals("*")&&!fields.contains(key))throw new JSONException("Unknown planner snapshot field");
                String child=allowed.equals("*")?"*":key;
                checkSnapshotFields(object.get(key),path.isEmpty()?child:path+"."+child);
            }
        }else if(value instanceof JSONArray){JSONArray array=(JSONArray)value;for(int i=0;i<array.length();i++)checkSnapshotFields(array.get(i),path+"[]");}
    }
}

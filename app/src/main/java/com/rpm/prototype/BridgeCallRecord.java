package com.rpm.prototype;

import android.content.Context;
import android.os.SystemClock;
import org.json.*;
import java.util.Set;

/** One native bridge call as a diagnostic operation record: action, model, duration and outcome. Never the request body. */
final class BridgeCallRecord {
    private static final Set<String> QUIET=Set.of("haptic","keyboard","status","surface","appSettings","load");
    private static final Set<String> DISPATCHED=Set.of("planner","capture","settings","minimize","expand");
    private final long start=SystemClock.elapsedRealtime();
    private final String action;
    private final JSONObject payload=new JSONObject();
    private String outcome="success";

    BridgeCallRecord(String action,JSONObject request){
        this.action=action;
        try{
            payload.put("action",action);
            if(request.has("expected"))payload.put("expectedRevision",request.optInt("expected"));
            JSONObject body=request.optJSONObject("body");
            if(body!=null)payload.put("model",body.optString("model")).put("reasoning",body.optJSONObject("reasoning")).put("maxTokens",body.optInt("max_tokens"));
        }catch(JSONException ignored){}
    }

    void result(Object result){
        try{if(result instanceof JSONObject&&((JSONObject)result).optInt("status",200)>=400){outcome="error";payload.put("statusCode",((JSONObject)result).optInt("status"));}}catch(JSONException ignored){}
        if(DISPATCHED.contains(action))outcome="dispatched";
    }

    /** Records the failure and returns the words the page may show. */
    String fail(Exception e){
        outcome=e instanceof java.util.concurrent.CancellationException?"cancelled":"error";
        try{payload.put("error",new JSONObject().put("type",e.getClass().getSimpleName()).put("message",e.getMessage()).put("stack",android.util.Log.getStackTraceString(e)));}catch(JSONException ignored){}
        String message=(action.equals("model")||action.equals("decision"))?"The OpenRouter connection failed. Check your key and internet connection.":e.getMessage();
        return message==null?"The phone could not finish that action.":message;
    }

    void record(Context context,String callId,String operationId){
        if(QUIET.contains(action))return;
        try{
            payload.put("durationMs",SystemClock.elapsedRealtime()-start);
            JSONObject event=Diagnostics.event("operation",outcome.equals("error")?"error":"info","native."+action,outcome,payload).put("sessionId",callId.substring(0,36)).put("operationId",operationId);
            Diagnostics.record(context,event);
        }catch(JSONException ignored){}
    }
}

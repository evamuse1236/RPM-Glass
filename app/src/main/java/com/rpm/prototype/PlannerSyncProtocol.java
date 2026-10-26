package com.rpm.prototype;

import org.json.JSONObject;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

final class PlannerSyncProtocol {
    static final long FOREGROUND_MS=20000,DEBOUNCE_MS=1000,BACKGROUND_MS=15*60*1000;
    interface Transport {JSONObject exchange(String action,JSONObject payload)throws Exception;}
    interface Runner {JSONObject run()throws Exception;}
    interface Guard {void check()throws Exception;}

    static void sync(Runner runner,Guard guard)throws Exception {
        guard.check();runner.run();guard.check();
    }
    static JSONObject exchange(String url,String token,String action,JSONObject payload,Guard guard)throws Exception {
        if(!action.equals("push")&&!action.equals("pull"))throw new IllegalArgumentException("Unsupported sync action");
        if(payload.toString().getBytes(StandardCharsets.UTF_8).length>1000000)throw new IOException("Planner sync request too large");
        guard.check();
        JSONObject response=SyncManager.request(url+"/v1/planner/"+action,"POST",payload,token);
        guard.check();return response;
    }
}

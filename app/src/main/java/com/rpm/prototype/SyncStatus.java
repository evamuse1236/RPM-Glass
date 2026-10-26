package com.rpm.prototype;

import org.json.JSONObject;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

/** Words for the phone's sync state, read from the replica in the planner store. */
final class SyncStatus {
    private SyncStatus(){}

    /** Records with edits the server has not received yet: stamped groups plus an unsent outbox. */
    static int waiting(JSONObject data){
        JSONObject sync=data==null?null:data.optJSONObject("sync");
        if(sync==null)return 0;
        Set<String> keys=new HashSet<>();
        JSONObject stamps=sync.optJSONObject("stamps");
        if(stamps!=null)for(Iterator<String> it=stamps.keys();it.hasNext();)keys.add(it.next());
        JSONObject outbox=sync.optJSONObject("outbox");
        org.json.JSONArray changes=outbox==null?null:outbox.optJSONArray("changes");
        if(changes!=null)for(int i=0;i<changes.length();i++){JSONObject change=changes.optJSONObject(i);if(change!=null)keys.add(change.optString("key"));}
        return keys.size();
    }

    static String planner(JSONObject data,int earlier){
        JSONObject sync=data==null?null:data.optJSONObject("sync");
        int waiting=waiting(data);
        String words=sync==null||sync.optJSONObject("base")==null?"Planner not synced yet"
            :waiting==0?"Planner synced":waiting==1?"1 planner change waiting to sync":waiting+" planner changes waiting to sync";
        return earlier>0?words+" · "+earlier+" earlier changes queued":words;
    }
}

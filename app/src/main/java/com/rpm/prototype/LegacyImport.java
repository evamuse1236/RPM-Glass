package com.rpm.prototype;

import android.content.Context;
import org.json.*;

/** One-time hand-over of the earlier screens' SQLite entries to the companion store.
 *  Native only reads; the WebView converts and saves through the versioned store, then marks it done.
 *  The SQLite file is never changed, so its records and alerts stay with the earlier screens. */
final class LegacyImport {
    private static final String PREFS="legacy-import",DONE="imported-at";
    static JSONObject read(Context c)throws JSONException{
        if(c.getSharedPreferences(PREFS,0).contains(DONE))return new JSONObject().put("done",true);
        if(!c.getDatabasePath("rpm-offline.db").exists()){markDone(c);return new JSONObject().put("done",true);}
        Store store=new Store(c);
        try{
            return new JSONObject().put("done",false)
                .put("entries",new JSONArray(store.query("SELECT * FROM entries ORDER BY _id",null)))
                .put("projects",new JSONArray(store.query("SELECT _id,result,purpose,domain FROM projects ORDER BY _id",null)))
                .put("revisions",new JSONArray(store.query("SELECT entry_id,at,reason FROM revisions ORDER BY _id",null)));
        }finally{store.close();}
    }
    static void markDone(Context c){c.getSharedPreferences(PREFS,0).edit().putLong(DONE,System.currentTimeMillis()).commit();}
}

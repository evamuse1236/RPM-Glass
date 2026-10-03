package com.rpm.prototype;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import org.json.*;
import java.io.File;

/** One-time hand-over of the earlier screens' SQLite entries to the companion store.
 *  Native only reads; the WebView converts and saves through the versioned store, then marks it done.
 *  The file is opened read-only (not through Store, whose helper would upgrade an older schema),
 *  so its records and alerts stay with the earlier screens unchanged. */
final class LegacyImport {
    private static final String PREFS="legacy-import",DONE="imported-at";
    static JSONObject read(Context c)throws JSONException{
        if(c.getSharedPreferences(PREFS,0).contains(DONE))return new JSONObject().put("done",true);
        File file=c.getDatabasePath("rpm-offline.db");
        if(!file.exists()){markDone(c);return new JSONObject().put("done",true);}
        try(SQLiteDatabase db=SQLiteDatabase.openDatabase(file.getPath(),null,SQLiteDatabase.OPEN_READONLY)){
            return new JSONObject().put("done",false)
                .put("entries",new JSONArray(Store.rows(db,"SELECT * FROM entries ORDER BY _id",null)))
                .put("projects",new JSONArray(Store.rows(db,"SELECT _id,result,purpose,domain FROM projects ORDER BY _id",null)))
                .put("revisions",new JSONArray(Store.rows(db,"SELECT entry_id,at,reason FROM revisions ORDER BY _id",null)));
        }
    }
    static void markDone(Context c){c.getSharedPreferences(PREFS,0).edit().putLong(DONE,System.currentTimeMillis()).apply();}
}

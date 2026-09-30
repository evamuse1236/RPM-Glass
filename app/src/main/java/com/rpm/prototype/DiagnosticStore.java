package com.rpm.prototype;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.*;

/** Private, bounded outbox. Telemetry cannot mutate companion.json or legacy plans. */
final class DiagnosticStore extends SQLiteOpenHelper {
    static final int MAX_ROWS=2000, MAX_BYTES=2*1024*1024;
    DiagnosticStore(Context context){this(context,"diagnostics.db");}
    DiagnosticStore(Context context,String name){super(context,name,null,1);}
    @Override public void onCreate(SQLiteDatabase db){db.execSQL("CREATE TABLE queue (id TEXT PRIMARY KEY, created INTEGER NOT NULL, level TEXT NOT NULL, body TEXT NOT NULL, bytes INTEGER NOT NULL)");db.execSQL("CREATE TABLE stats (id INTEGER PRIMARY KEY, dropped INTEGER NOT NULL)");db.execSQL("INSERT INTO stats VALUES (1,0)");}
    @Override public void onUpgrade(SQLiteDatabase db,int old,int next){throw new IllegalStateException("Unsupported diagnostic database version");}
    synchronized void add(JSONObject event)throws Exception{
        String body=event.toString();int size=body.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
        if(size>64000)throw new IllegalArgumentException("Diagnostic event too large");
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{ContentValues values=new ContentValues();values.put("id",event.getString("eventId"));values.put("created",System.currentTimeMillis());values.put("level",event.getString("level"));values.put("body",body);values.put("bytes",size);db.insertOrThrow("queue",null,values);
            int removed=db.delete("queue","created < ?",new String[]{String.valueOf(System.currentTimeMillis()-14L*86400000)});
            while(count()>MAX_ROWS||bytes()>MAX_BYTES){removed+=db.delete("queue","id IN (SELECT id FROM queue ORDER BY CASE WHEN level IN ('error','warn') THEN 1 ELSE 0 END, rowid LIMIT 1)",null);}
            if(removed>0)db.execSQL("UPDATE stats SET dropped=dropped+? WHERE id=1",new Object[]{removed});db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
    synchronized JSONArray batch()throws JSONException{
        JSONArray out=new JSONArray();int size=0;
        try(Cursor c=getReadableDatabase().rawQuery("SELECT body,bytes FROM queue ORDER BY rowid LIMIT 20",null)){
            while(c.moveToNext()){int next=c.getInt(1);if(size+next>192000)break;out.put(new JSONObject(c.getString(0)));size+=next;}
        }return out;
    }
    synchronized void acknowledge(JSONArray sent,JSONArray ack)throws JSONException{
        SyncManager.validateAck(sent,ack);SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{for(int i=0;i<ack.length();i++)db.delete("queue","id=?",new String[]{ack.getString(i)});db.setTransactionSuccessful();}finally{db.endTransaction();}
    }
    synchronized long count(){return scalar("SELECT COUNT(*) FROM queue");}
    synchronized long bytes(){return scalar("SELECT COALESCE(SUM(bytes),0) FROM queue");}
    synchronized long dropped(){return scalar("SELECT dropped FROM stats WHERE id=1");}
    synchronized void clear(){getWritableDatabase().delete("queue",null,null);}
    private long scalar(String sql){try(Cursor c=getReadableDatabase().rawQuery(sql,null)){return c.moveToFirst()?c.getLong(0):0;}}
}

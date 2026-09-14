package com.rpm.prototype;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.*;
import java.util.*;

/** Local records and upload outbox commit atomically. Network never gates saving. */
public final class Store extends SQLiteOpenHelper {
    private final Context context;
    private final boolean cloudEligible;
    public Store(Context c) { this(c, "rpm-offline.db"); }
    Store(Context c, String name) {
        super(c, name, null, 2);
        context=c.getApplicationContext();cloudEligible="rpm-offline.db".equals(name);
    }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE entries (_id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, raw TEXT NOT NULL, title TEXT NOT NULL, created INTEGER NOT NULL, planned INTEGER, minutes INTEGER, duration_source TEXT NOT NULL, mood TEXT, energy TEXT, notes TEXT NOT NULL DEFAULT '', interpretation TEXT NOT NULL DEFAULT '', purpose TEXT NOT NULL DEFAULT '', project INTEGER, done INTEGER NOT NULL DEFAULT 0, reminder INTEGER, reminder_status TEXT NOT NULL DEFAULT 'none', alarm INTEGER, alarm_status TEXT NOT NULL DEFAULT 'none')");
        db.execSQL("CREATE TABLE revisions (_id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id INTEGER NOT NULL, at INTEGER NOT NULL, reason TEXT NOT NULL, snapshot TEXT NOT NULL)");
        db.execSQL("CREATE TABLE projects (_id INTEGER PRIMARY KEY AUTOINCREMENT, result TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT '', domain TEXT NOT NULL DEFAULT '')");
        db.execSQL("CREATE INDEX entries_created ON entries(created DESC)");
        createSyncTables(db);
    }
    private void createSyncTables(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
        db.execSQL("CREATE TABLE outbox (_id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT UNIQUE NOT NULL, collection TEXT NOT NULL, local_id TEXT NOT NULL, payload TEXT NOT NULL)");
        ContentValues v=new ContentValues();v.put("key","installation_id");v.put("value",UUID.randomUUID().toString());db.insertOrThrow("meta",null,v);
    }
    @Override public void onUpgrade(SQLiteDatabase db,int old,int next) {
        if(old<2) {
            db.execSQL("ALTER TABLE entries ADD COLUMN alarm INTEGER");
            db.execSQL("ALTER TABLE entries ADD COLUMN alarm_status TEXT NOT NULL DEFAULT 'none'");
            createSyncTables(db);
            for(String table:new String[]{"entries","revisions","projects"})
                for(JSONObject row:rows(db,"SELECT * FROM "+table+" ORDER BY _id",null))enqueue(db,table,row.optLong("_id"),row);
        }
    }
    public String installationId(){return query("SELECT value FROM meta WHERE key='installation_id'",null).get(0).optString("value");}
    private void changed(){if(cloudEligible)SyncManager.request(context);}
    public long add(ContentValues values) {
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();long id;
        try{id=db.insertOrThrow("entries",null,values);revision(db,id,"Created from original input");db.setTransactionSuccessful();}
        finally{db.endTransaction();}
        changed();return id;
    }
    public void update(long id,ContentValues values,String reason) {
        if(values.containsKey("raw")||values.containsKey("created")||values.containsKey("kind"))throw new IllegalArgumentException("Original input and record identity cannot be rewritten");
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{
            if(db.update("entries",values,"_id=?",new String[]{""+id})!=1)throw new IllegalArgumentException("Entry not found");
            revision(db,id,reason);db.setTransactionSuccessful();
        }finally{db.endTransaction();}
        changed();
    }
    private void revision(SQLiteDatabase db,long id,String reason) {
        JSONObject entry=rows(db,"SELECT * FROM entries WHERE _id=?",new String[]{""+id}).get(0);
        ContentValues v=new ContentValues();v.put("entry_id",id);v.put("at",System.currentTimeMillis());v.put("reason",reason);v.put("snapshot",entry.toString());
        long rev=db.insertOrThrow("revisions",null,v);
        enqueue(db,"entries",id,entry);
        enqueue(db,"revisions",rev,rows(db,"SELECT * FROM revisions WHERE _id=?",new String[]{""+rev}).get(0));
    }
    public long saveProject(Long id,ContentValues values){
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{
            if(id==null)id=db.insertOrThrow("projects",null,values);
            else if(db.update("projects",values,"_id=?",new String[]{""+id})!=1)throw new IllegalArgumentException("Result not found");
            enqueue(db,"projects",id,rows(db,"SELECT * FROM projects WHERE _id=?",new String[]{""+id}).get(0));db.setTransactionSuccessful();
        }finally{db.endTransaction();}
        changed();return id;
    }
    private void enqueue(SQLiteDatabase db,String collection,long id,JSONObject payload){
        ContentValues v=new ContentValues();v.put("event_id",UUID.randomUUID().toString());v.put("collection",collection);v.put("local_id",""+id);v.put("payload",payload.toString());db.insertOrThrow("outbox",null,v);
    }
    public void queueAll(){
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{for(String table:new String[]{"entries","revisions","projects"})for(JSONObject row:rows(db,"SELECT * FROM "+table+" ORDER BY _id",null))enqueue(db,table,row.optLong("_id"),row);db.setTransactionSuccessful();}finally{db.endTransaction();}
        changed();
    }
    public int pendingCount(){return query("SELECT count(*) AS n FROM outbox",null).get(0).optInt("n");}
    public JSONArray pendingBatch(){
        JSONArray events=new JSONArray();int bytes=0;
        try{
            for(JSONObject row:query("SELECT * FROM outbox ORDER BY _id LIMIT 40",null)){
                JSONObject event=new JSONObject().put("eventId",row.optString("event_id")).put("sequence",row.optLong("_id"))
                    .put("collection",row.optString("collection")).put("localId",row.optString("local_id")).put("payload",new JSONObject(row.optString("payload")));
                int length=event.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
                if(events.length()>0&&bytes+length>200000)break;
                events.put(event);bytes+=length;
            }
        }catch(JSONException ex){throw new IllegalStateException(ex);}
        return events;
    }
    public void acknowledge(JSONArray ids){
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{for(int i=0;i<ids.length();i++)db.delete("outbox","event_id=?",new String[]{ids.optString(i)});db.setTransactionSuccessful();}
        finally{db.endTransaction();}
    }
    public JSONObject get(long id){List<JSONObject> list=query("SELECT * FROM entries WHERE _id=?",new String[]{""+id});if(list.isEmpty())throw new IllegalArgumentException("Entry missing");return list.get(0);}
    public List<JSONObject> entries(String mode){
        String condition=mode.equals("next")?" WHERE kind='plan' AND done=0":mode.equals("checkin")?" WHERE kind='checkin'":"";
        String order=mode.equals("next")?" ORDER BY planned IS NULL, planned, created DESC, _id DESC":" ORDER BY created DESC, _id DESC";
        return query("SELECT * FROM entries"+condition+order,null);
    }
    public List<JSONObject> projects(){return query("SELECT * FROM projects ORDER BY _id DESC",null);}
    public List<JSONObject> query(String sql,String[] args){return rows(getReadableDatabase(),sql,args);}
    private static List<JSONObject> rows(SQLiteDatabase db,String sql,String[] args){
        ArrayList<JSONObject> result=new ArrayList<>();
        try(Cursor c=db.rawQuery(sql,args)){
            while(c.moveToNext()){
                JSONObject o=new JSONObject();
                for(int i=0;i<c.getColumnCount();i++)try{o.put(c.getColumnName(i),c.isNull(i)?JSONObject.NULL:c.getType(i)==Cursor.FIELD_TYPE_INTEGER?c.getLong(i):c.getString(i));}catch(JSONException e){throw new IllegalStateException(e);}
                result.add(o);
            }
        }return result;
    }
    public String exportJson(){
        try{return new JSONObject().put("format","rpm-offline-v2").put("installationId",installationId()).put("exportedAt",System.currentTimeMillis())
            .put("entries",new JSONArray(entries("all"))).put("projects",new JSONArray(projects()))
            .put("revisions",new JSONArray(query("SELECT * FROM revisions ORDER BY _id",null))).toString(2);
        }catch(JSONException e){throw new IllegalStateException(e);}
    }
}

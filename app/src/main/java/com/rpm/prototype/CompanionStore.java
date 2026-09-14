package com.rpm.prototype;

import android.content.Context;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Independent from legacy SQLite/outbox: companion context never silently syncs. */
final class CompanionStore {
    static final Object LOCK=new Object();
    static File file(Context c){return new File(c.getFilesDir(),"companion.json");}
    static JSONObject read(Context c)throws Exception{synchronized(LOCK){AtomicFile f=new AtomicFile(file(c));try(InputStream in=f.openRead()){return validate(new JSONObject(readText(in)));}catch(FileNotFoundException e){return null;}}}
    static String readText(InputStream in)throws IOException{ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){out.write(b,0,n);if(out.size()>16*1024*1024)throw new IOException("Context exceeds 16 MB; original preserved.");}return out.toString(StandardCharsets.UTF_8.name());}
    static JSONObject validate(JSONObject d)throws JSONException{
        if(d.getInt("schema")!=2||d.getInt("version")<0)throw new JSONException("Unsupported context format.");
        for(String k:new String[]{"entries","memories","history","conversations"})d.getJSONArray(k);
        if(d.getJSONArray("conversations").length()==0)throw new JSONException("A conversation is required.");
        java.util.HashSet<Long> ids=new java.util.HashSet<>();JSONArray entries=d.getJSONArray("entries");
        for(int i=0;i<entries.length();i++){JSONObject e=entries.getJSONObject(i);long id=e.getLong("id");if(id<=0||!ids.add(id))throw new JSONException("Invalid or duplicate entry ID.");e.getString("title");e.getString("raw");e.getJSONArray("revisions");}
        return d;
    }
    static void write(Context c,JSONObject d,int expected)throws Exception{synchronized(LOCK){JSONObject old=read(c);int current=old==null?0:old.getInt("version");if(expected!=current||d.getInt("version")!=current+1)throw new IOException("Saved context changed. Reopen RPM before retrying.");writeRaw(c,validate(d));CompanionAlerts.reconcile(c,d,false);}}
    static void writeRaw(Context c,JSONObject d)throws IOException{byte[] bytes=d.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>16*1024*1024)throw new IOException("Context exceeds 16 MB; original preserved. Export a backup before reducing history.");AtomicFile f=new AtomicFile(file(c));FileOutputStream out=null;try{out=f.startWrite();out.write(bytes);f.finishWrite(out);}catch(IOException e){if(out!=null)f.failWrite(out);throw e;}}
    static void importCopy(Context c,JSONObject d)throws Exception{synchronized(LOCK){validate(d);JSONObject old=read(c);if(old!=null){File backup=new File(c.getFilesDir(),"companion-before-import-"+System.currentTimeMillis()+".json");try(FileOutputStream out=new FileOutputStream(backup)){out.write(old.toString().getBytes(StandardCharsets.UTF_8));}}
        CompanionAlerts.cancelAll(c);d.put("version",old==null?1:old.optInt("version")+1);d.put("pending",JSONObject.NULL);d.put("undo",JSONObject.NULL);d.put("inFlight",false);d.put("imported",new JSONObject().put("source","User-selected context copy").put("at",java.time.Instant.now().toString()));
        // Persist the disarm ledger before the file: a crash must never arm imported history.
        if(d.optJSONObject("planner")!=null)d.getJSONObject("planner").put("undo",JSONObject.NULL);
        CompanionAlerts.disarmImport(c,d);writeRaw(c,d);
    }}
}

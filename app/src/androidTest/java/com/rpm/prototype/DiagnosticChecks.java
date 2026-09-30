package com.rpm.prototype;
import android.app.*;
import android.content.*;
import android.os.*;
import org.json.*;
import java.util.*;

/** Isolated storage checks; optional live mode uses a disposable emulator only. */
final class DiagnosticChecks {
    private static int checks;
    static void check(boolean good,String message){checks++;if(!good)throw new AssertionError(message);}
    static JSONObject event(int n)throws Exception{return new JSONObject().put("eventId","synthetic-diagnostic-"+n).put("sessionId","synthetic-native-session").put("operationId","synthetic-native-operation").put("kind","console").put("operation","console").put("outcome","").put("level","info").put("occurredAt",System.currentTimeMillis()).put("payload",new JSONObject().put("message","Synthetic test capture"));}
    static void run(Instrumentation test,Bundle args){Context c=test.getTargetContext();Bundle result=new Bundle();String db="diagnostics-integration-test.db";
        try{
            String mode=args.getString("diagnostics");
            if("connect".equals(mode)){Diagnostics.pair(c,args.getString("code"));check(Diagnostics.enabled(c),"diagnostic connection active");}
            else if("emit".equals(mode)){JSONObject e=Diagnostics.event("console","error","synthetic.live","error",new JSONObject().put("message","Synthetic capture diagnostic").put("apiKey","SYNTHETIC-SECRET-NOT-FOR-STORAGE").put("stack","SyntheticError: offline at fixture.js:1"));e.put("sessionId","diagnostic-live-fixture").put("operationId","diagnostic-live-fixture");Diagnostics.recordNow(c,e);check(Diagnostics.status(c).getLong("queued")>0,"synthetic log is durable before upload");}
            else if("upload".equals(mode)){JSONArray sent;try(DiagnosticStore store=new DiagnosticStore(c)){sent=store.batch();}Diagnostics.NETWORK.submit(()->{Diagnostics.prefs(c).edit().putLong("next_attempt",0).commit();return Diagnostics.sync(c);}).get(40,java.util.concurrent.TimeUnit.SECONDS);JSONObject status=Diagnostics.status(c);check(status.getLong("lastUpload")>0,"server acknowledged upload");try(DiagnosticStore store=new DiagnosticStore(c)){for(int i=0;i<sent.length();i++)try(android.database.Cursor cursor=store.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM queue WHERE id=?",new String[]{sent.getJSONObject(i).getString("eventId")})){cursor.moveToFirst();check(cursor.getLong(0)==0,"acknowledged event removed; newly arriving logs may remain");}}}
            else if("disconnect".equals(mode)){Diagnostics.disconnect(c);check(!Diagnostics.enabled(c),"disconnected");}
            else if("status".equals(mode)){result.putString("diagnostics",Diagnostics.status(c).toString());}
            else{
                c.deleteDatabase(db);
                JSONObject raw=new JSONObject().put("apiKey","SECRET").put("nested",new JSONObject().put("password","SECRET")).put("message","Synthetic private capture · Bearer SECRET").put("url","https://u:SECRET@example.org/?token=SECRET").put("known","native-key-do-not-store");
                String safe=DiagnosticRedaction.value(raw,0,"native-key-do-not-store").toString();check(!safe.contains("SECRET"),"keys, header and URL secrets redacted");check(!safe.contains("native-key-do-not-store"),"exact native credential redacted");check(safe.contains("Synthetic private capture"),"authorized personal text preserved");
                try(DiagnosticStore store=new DiagnosticStore(c,db)){store.add(event(1));store.add(event(2));check(store.count()==2,"queue inserted");}
                try(DiagnosticStore store=new DiagnosticStore(c,db)){
                    check(store.count()==2,"queue survives close/reopen");JSONArray batch=store.batch();check(batch.getJSONObject(0).getString("eventId").equals("synthetic-diagnostic-1"),"retry identity stable");
                    try{store.acknowledge(batch,new JSONArray().put("synthetic-diagnostic-1"));throw new AssertionError("partial ack accepted");}catch(JSONException expected){check(store.count()==2,"partial ack deletes nothing");}
                    store.add(event(3));store.acknowledge(batch,new JSONArray().put("synthetic-diagnostic-1").put("synthetic-diagnostic-2"));check(store.count()==1,"new event survives older acknowledgement");
                    JSONObject huge=event(4).put("payload",new JSONObject().put("content","x".repeat(65000)));try{store.add(huge);throw new AssertionError("oversized event accepted");}catch(IllegalArgumentException expected){check(store.count()==1,"oversized payload rejected without changing queue");}
                    store.clear();for(int i=10;i<70;i++)store.add(event(i).put("payload",new JSONObject().put("content","x".repeat(40000))));check(store.bytes()<=DiagnosticStore.MAX_BYTES,"byte capacity enforced");check(store.dropped()>0,"overflow losses visible");JSONArray limited=store.batch();check(limited.length()<=4,"batch stays within upload body budget");
                    store.clear();check(store.count()==0,"disconnect-style clear removes local logs");
                    for(int i=100;i<2105;i++)store.add(event(i));check(store.count()==DiagnosticStore.MAX_ROWS,"row capacity enforced");
                }finally{c.deleteDatabase(db);}
            }
            result.putString("stream","PASS: "+checks+" diagnostic Android checks ("+mode+")\n");test.finish(Activity.RESULT_OK,result);
        }catch(Throwable e){result.putString("stream","FAIL after "+checks+" checks: "+android.util.Log.getStackTraceString(e));test.finish(Activity.RESULT_CANCELED,result);}
    }
}

package com.rpm.prototype;

import android.app.job.*;
import android.content.*;
import android.os.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Full app console capture with durable, authenticated, upload-only delivery. */
final class Diagnostics {
    private static final int CHANGE=7411,PERIODIC=7412;
    static final String PROCESS=UUID.randomUUID().toString();
    private static final AtomicLong rejected=new AtomicLong();
    private static final ThreadPoolExecutor WRITER=new ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(128),(r,e)->rejected.incrementAndGet());
    static final ExecutorService NETWORK=Executors.newSingleThreadExecutor();
    private static final AtomicBoolean uploading=new AtomicBoolean();
    private static final Handler TIMER=new Handler(Looper.getMainLooper());
    private static final AtomicBoolean scheduled=new AtomicBoolean();
    static SharedPreferences prefs(Context c){return c.getSharedPreferences("diagnostics",0);}
    static boolean ownConnection(Context c){return prefs(c).contains("token");}
    static boolean configured(Context c){return !prefs(c).getBoolean("disconnected",false)&&(ownConnection(c)||SyncManager.configured(c));}
    static boolean enabled(Context c){return configured(c)&&prefs(c).getBoolean("enabled",true)&&!prefs(c).getBoolean("auth_error",false);}
    private static SharedPreferences connection(Context c){return ownConnection(c)?prefs(c):SyncManager.prefs(c);}
    static void initialize(Context c){
        Context app=c.getApplicationContext();request(app);
        Thread.UncaughtExceptionHandler previous=Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread,error)->{try{recordNow(app,event("crash","error","native.crash","error",new JSONObject().put("thread",thread.getName()).put("error",android.util.Log.getStackTraceString(error))));}catch(Throwable ignored){}finally{if(previous!=null)previous.uncaughtException(thread,error);else{android.os.Process.killProcess(android.os.Process.myPid());System.exit(10);}}});
        record(app,event("lifecycle","info","app.start","success",new JSONObject()));
    }
    static JSONObject event(String kind,String level,String operation,String outcome,JSONObject payload){try{return new JSONObject().put("eventId",UUID.randomUUID().toString()).put("sessionId",PROCESS).put("operationId","").put("operation",operation).put("outcome",outcome).put("occurredAt",System.currentTimeMillis()).put("kind",kind).put("level",level).put("payload",payload);}catch(JSONException e){throw new IllegalStateException(e);}}
    static void record(Context c,JSONObject event){if(!enabled(c))return;Context app=c.getApplicationContext();WRITER.execute(()->{try{recordNow(app,event);request(app);}catch(Exception ignored){rejected.incrementAndGet();}});}
    static void recordNow(Context c,JSONObject input)throws Exception{
        if(!enabled(c))return;
        String key=CompanionKey.get(c),token=SyncManager.decrypt(connection(c).getString("token",""));
        JSONObject event=(JSONObject)DiagnosticRedaction.value(input,0,key,token);
        event.put("appVersion",c.getPackageManager().getPackageInfo(c.getPackageName(),0).versionName);
        if(!event.optString("eventId").matches("[a-zA-Z0-9-]{16,80}")||event.optString("sessionId").length()>100||event.optString("sessionId").isEmpty()||event.optString("operationId").length()>160||event.optString("operation").length()>100||event.optString("outcome").length()>40||event.optString("kind").length()>40||!Set.of("log","debug","info","warn","error").contains(event.optString("level")))throw new IllegalArgumentException("Invalid diagnostic event");
        long at=event.optLong("occurredAt",0);if(at<0||at>System.currentTimeMillis()+86400000L)event.put("occurredAt",System.currentTimeMillis());
        // A malformed oversized argument remains visible as a bounded preview.
        if(event.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8).length>60000){String raw=event.opt("payload").toString();event.put("payload",new JSONObject().put("truncated",true).put("preview",raw.substring(0,Math.min(10000,raw.length()))));}
        JSONObject payload=event.optJSONObject("payload");if(payload!=null)payload.put("native",new JSONObject().put("sdk",Build.VERSION.SDK_INT).put("model",Build.MODEL).put("processSession",PROCESS));
        synchronized(DiagnosticStore.class){try(DiagnosticStore store=new DiagnosticStore(c)){store.add(event);}}
    }
    static void fromJs(Context c,String body){if(body==null||body.length()>100000||!enabled(c))return;try{record(c,new JSONObject(body));}catch(JSONException ignored){rejected.incrementAndGet();}}
    static void chrome(Context c,android.webkit.ConsoleMessage message){try{record(c,event("console",message.messageLevel()==android.webkit.ConsoleMessage.MessageLevel.ERROR?"error":"log","webview.bootstrap","",new JSONObject().put("message",message.message()).put("source",message.sourceId()).put("line",message.lineNumber())));}catch(JSONException ignored){}}
    static JSONObject status(Context c)throws JSONException{
        JSONObject out=new JSONObject().put("connected",configured(c)).put("enabled",enabled(c)).put("paused",configured(c)&&!prefs(c).getBoolean("enabled",true)).put("authError",prefs(c).getBoolean("auth_error",false)).put("message",prefs(c).getString("status",configured(c)?"Ready to upload":"Not connected")).put("lastUpload",prefs(c).getLong("last_success",0)).put("endpoint",configured(c)?connection(c).getString("url",""):"").put("rejected",rejected.get());
        synchronized(DiagnosticStore.class){try(DiagnosticStore store=new DiagnosticStore(c)){out.put("queued",store.count()).put("dropped",store.dropped());}}return out;
    }
    static void pause(Context c,boolean paused){prefs(c).edit().putBoolean("enabled",!paused).commit();if(paused)cancel(c);else request(c);}
    static void disconnect(Context c){prefs(c).edit().clear().putBoolean("disconnected",true).commit();cancel(c);synchronized(DiagnosticStore.class){try(DiagnosticStore store=new DiagnosticStore(c)){store.clear();}}}
    static void request(Context c){
        if(!enabled(c))return;Context app=c.getApplicationContext();JobScheduler scheduler=c.getSystemService(JobScheduler.class);ComponentName service=new ComponentName(c,DiagnosticJob.class);
        if(scheduler.getPendingJob(CHANGE)==null)scheduler.schedule(new JobInfo.Builder(CHANGE,service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(10000).setBackoffCriteria(30000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).setPersisted(true).build());
        if(scheduler.getPendingJob(PERIODIC)==null)scheduler.schedule(new JobInfo.Builder(PERIODIC,service).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000).setPersisted(true).build());
        if(scheduled.compareAndSet(false,true))TIMER.postDelayed(()->{scheduled.set(false);NETWORK.execute(()->sync(app));},Math.max(5000,prefs(c).getLong("next_attempt",0)-System.currentTimeMillis()));
    }
    private static void cancel(Context c){JobScheduler scheduler=c.getSystemService(JobScheduler.class);scheduler.cancel(CHANGE);scheduler.cancel(PERIODIC);}
    static void pair(Context c,String code)throws Exception{
        if(!code.trim().matches("[a-f0-9]{32}"))throw new IllegalArgumentException("Use the 32-character diagnostic pairing code");
        String url=SyncManager.validateUrl(c.getString(R.string.convex_default_url)),installation=prefs(c).getString("installation",UUID.randomUUID().toString());
        JSONObject result=SyncManager.post(url+"/v1/diagnostics/pair",new JSONObject().put("code",code.trim()).put("installationId",installation),null);
        String token=result.getString("token");if(!token.matches("[a-f0-9]{64}"))throw new java.io.IOException("Invalid pairing response");
        if(!prefs(c).edit().putString("url",url).putString("token",SyncManager.encrypt(token)).putString("installation",installation).putBoolean("enabled",true).putBoolean("disconnected",false).putBoolean("auth_error",false).putLong("next_attempt",0).putInt("failures",0).putString("status","Connected · waiting to upload").commit())throw new java.io.IOException("Could not save diagnostic connection");
        record(c,event("lifecycle","info","diagnostics.connected","success",new JSONObject()));request(c);
    }
    static void uploadNow(Context c){prefs(c).edit().putLong("next_attempt",0).apply();NETWORK.execute(()->sync(c.getApplicationContext()));}
    static boolean sync(Context c){
        if(!enabled(c))return false;if(System.currentTimeMillis()<prefs(c).getLong("next_attempt",0))return true;if(!uploading.compareAndSet(false,true))return true;
        try{String url=SyncManager.validateUrl(connection(c).getString("url","")),token=SyncManager.decrypt(connection(c).getString("token",""));long deadline=SystemClock.elapsedRealtime()+25000;
            for(int i=0;i<8&&SystemClock.elapsedRealtime()<deadline;i++){
                if(!enabled(c)||Thread.currentThread().isInterrupted())return false;
                JSONArray batch;synchronized(DiagnosticStore.class){try(DiagnosticStore store=new DiagnosticStore(c)){batch=store.batch();}}
                if(batch.length()==0)return false;
                JSONObject response=SyncManager.post(url+"/v1/diagnostics",new JSONObject().put("events",batch),token);
                synchronized(DiagnosticStore.class){try(DiagnosticStore store=new DiagnosticStore(c)){store.acknowledge(batch,response.getJSONArray("ack"));}}
                prefs(c).edit().putInt("failures",0).putLong("next_attempt",0).putString("status","Uploaded").putLong("last_success",System.currentTimeMillis()).apply();
            }return true;
        }catch(SyncManager.Unauthorized e){prefs(c).edit().putBoolean("auth_error",true).putString("status","Connection revoked · pair diagnostics again").apply();cancel(c);return false;}
        catch(SyncManager.Rejected e){prefs(c).edit().putString("status","Upload rejected · queued logs kept").apply();return false;}
        catch(Exception e){int failures=Math.min(6,prefs(c).getInt("failures",0)+1);long delay=Math.min(15*60*1000L,30000L*(1L<<(failures-1)));prefs(c).edit().putInt("failures",failures).putLong("next_attempt",System.currentTimeMillis()+delay).putString("status","Offline or unavailable · logs queued").apply();return true;}
        finally{uploading.set(false);}
    }
}
